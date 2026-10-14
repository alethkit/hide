-- SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
{-# LANGUAGE OverloadedStrings #-}
-- |
-- Module      : Hide.InspectorWindow
-- Copyright   : (c) 2026 Edward Kmett
-- License     : BSD-2-Clause OR Apache-2.0
-- Maintainer  : Edward Kmett <ekmett@gmail.com>
-- Stability   : experimental
-- Portability : OverloadedStrings
--
-- Host rendering of "Hide.Plugin.Inspect" documents on the existing prepared
-- rows window: a selectable list above one readonly Details pane.
--
-- The semantic document stays free of presentation. Here a 'List' becomes its
-- rows and a 'Text' document becomes one row per heading, with prose and facts
-- as that row's Details. Other applicable views of the same object are appended
-- as navigation rows, so view switching needs no new widget. Row actions are not
-- stored in the window: the owner keeps a small @NodeId -> RowAction@ table per
-- exact 'W.WindowRef', and a later action is admitted only through that table,
-- so a recycled row index or label cannot retarget it.
--
-- Everything runs on the caller's worker. Inspector windows are private by
-- default (no agent disclosure) and publication goes through the ordinary
-- scoped 'W.openWindow'/'adoptWindowUpdate' path.
module Hide.InspectorWindow
  ( Inspector, withInspector, inspectorViews, inspectorPublisher'
  , RowAction(..), Page(..), buildPage, inspectSubject, followInspectorRow, pageAction, setOpenMenu
  ) where

import Control.Monad (filterM)
import Data.IORef
import Data.List (find)
import qualified Data.Map.Strict as M
import Data.Text (Text)
import qualified Data.Text as T
import qualified Hide.Plugin.Menu as Menu
import Hide.Plugin.Inspect
import qualified Hide.Plugin.Tree as Tree
import qualified Hide.Plugin.Window as W

-- | What a row does when activated. It is closed data, never a callback.
data RowAction = Navigate !Subject | ShowView !Subject !ViewId | OpenPath !FilePath | GoBack
  deriving (Eq,Show)

-- | A prepared window and the exact actions of its rows.
data Page = Page { pageWindow :: !W.PreparedWindow, pageActions :: !(M.Map Tree.NodeId RowAction) }

-- | The registry, window publication scope and live page tables of one session.
data Inspector = Inspector
  { inspectorViews :: !Inspectors, inspectorScope :: !W.WindowScope
  , inspectorPages :: !(IORef [(W.WindowRef,(M.Map Tree.NodeId RowAction,[(Subject,Maybe ViewId)]))])
  , inspectorMenu :: !(IORef [Menu.MenuRef]) }

-- | Scope the registry and its window lifetimes. Closing retires every escaped
-- window reference and refuses later discovery or publication.
withInspector :: (Inspector -> IO a) -> IO a
withInspector use=withInspectors $ \views->W.withWindowScope $ \scope->do
  pages<-newIORef []
  menu<-newIORef []
  use (Inspector views scope pages menu)

-- | The plugin-facing publication capability for this inspector's registry.
inspectorPublisher' :: Inspector -> InspectPublisher
inspectorPublisher'=inspectPublisher . inspectorViews

-- | The menu contribution rows windows reference, set by its owner and cleared
-- on teardown. Rows windows opened while it is empty simply offer no actions.
setOpenMenu :: Inspector -> [Menu.MenuRef] -> IO ()
setOpenMenu inspector=writeIORef (inspectorMenu inspector)

-- | The action recorded for this exact window and row, if the window is still
-- remembered. Only the newest 64 windows are retained.
pageAction :: Inspector -> W.WindowRef -> Tree.NodeId -> IO (Maybe RowAction)
pageAction inspector reference node=do
  live<-W.windowRefCurrent reference
  pages<-readIORef (inspectorPages inspector)
  pure (if live then lookup reference pages >>= M.lookup node . fst else Nothing)

-- | Build the rows window for one object and view. @views@ are the other
-- applicable views, offered as navigation rows after the document's own.
buildPage :: [Menu.MenuRef] -> Subject -> Text -> [ViewInfo] -> PreparedDoc -> IO (Either Text Page)
buildPage refs subject currentTitle others prepared=buildPageWithBack refs subject currentTitle others prepared False

buildPageWithBack :: [Menu.MenuRef] -> Subject -> Text -> [ViewInfo] -> PreparedDoc -> Bool -> IO (Either Text Page)
buildPageWithBack refs subject currentTitle others prepared hasBack=do
  let docRows=case preparedDoc prepared of
        List _ items->[(itemLabel item,itemDetail item,fmap action (itemTarget item)) | item<-items]
        Text blocks->[(heading,body,Nothing) | (heading,body)<-textRows blocks]
      viewRows=[("→ "<>T.take 200 (infoTitle view)<>" view","Show the "<>infoTitle view<>" view of this "<>typeName<>".",Just (ShowView subject (infoView view)))
               | view<-take 8 others]
      backRows=[("← Back","Return to the previous inspected object.",Just GoBack) | hasBack]
      room=64-length viewRows-length backRows
      kept=if length docRows<=room then docRows
            else take (room-1) docRows++[("… more rows","Some rows are not shown.",Nothing)]
      rows=(if null kept && null viewRows then [("No content","This view produced no rows.",Nothing)] else kept)++viewRows++backRows
      title=case preparedDoc prepared of
        List heading _ | not (T.null heading)->heading
        _->typeName<>" · "<>currentTitle
  built<-mapM detail (zip [1::Int ..] rows)
  case sequence [row | (row,_)<-built] of
    Left err->pure (Left err)
    Right windowRows->do
      window<-W.prepareRowsWindow (T.take 240 title) refs windowRows
      pure $ case window of
        Left err->Left err
        Right value->Right (Page value (M.fromList [(node,action') | (Right (W.WindowRow node _ _),Just action')<-built]))
  where
    typeName=T.pack (show (subjectType subject))
    action (Inspect target)=Navigate target
    action (OpenFile path)=OpenPath path
    detail (index,(label,body,act))=do
      node<-pure (Tree.nodeId (T.pack (maybe "r" (const "a") act<>show index)))
      text<-W.prepareTextWindow "Details" (T.take maxDetail body)
      pure (either Left (\ident->Right (W.WindowRow ident (T.take 240 label) text)) node,act)

-- Group a text document into captioned rows: a heading opens a row, prose and
-- facts extend the current row's Details. Content before any heading goes in an
-- "Overview" row.
textRows :: [Block] -> [(Text,Text)]
textRows=map finish . reverse . foldl accumulate []
  where
    accumulate rows (Heading text)=(text,[]):rows
    accumulate [] other=accumulate [("Overview",[])] other
    accumulate ((caption,parts):rows) (Prose text)=(caption,parts++[text]):rows
    accumulate ((caption,parts):rows) (Facts facts)=(caption,parts++[key<>": "<>value | (key,value)<-facts]):rows
    finish (caption,parts)=(caption,T.intercalate "\n" parts)

-- | Render one object in the requested view, or its first applicable view, as an
-- unadopted window. Queries run only for human origins and only while their
-- command registration is current; every document is bounded and forced here.
inspectSubject :: Inspector -> InspectContext -> Subject -> Maybe ViewId -> IO (Either Text W.WindowUpdate)
inspectSubject inspector context subject requested=inspectWithHistory inspector context subject requested []

-- History belongs to the exact page, never a session-global current object.
-- It retains at most 32 typed locations; revisiting always resolves live roots.
inspectWithHistory :: Inspector -> InspectContext -> Subject -> Maybe ViewId -> [(Subject,Maybe ViewId)] -> IO (Either Text W.WindowUpdate)
inspectWithHistory inspector context subject requested history=do
  available<-applicableViews (inspectorViews inspector) subject
  refs<-readIORef (inspectorMenu inspector)
  case (requested,available) of
    (Just wanted,_) | wanted `notElem` map infoView available->pure (Left "That view does not apply to this object.")
    (_,[])->publish refs "No views" [] (List "" [Item ("No views are attached to "<>T.pack (show (subjectType subject))) "" Nothing])
    (_,first:_)->do
      let current=maybe first id (find (\view->Just (infoView view)==requested) available)
      body<-openView (inspectorViews inspector) subject (infoView current)
      doc<-case body of
        Left err->pure (Left (T.pack (show err)))
        Right (Ready value)->pure (Right value)
        Right (Queried q)
          | inspectOrigin context/=Menu.HumanMenu->pure (Left "Queries require human input.")
          | otherwise->either (Left . T.pack . show) Right <$> runQuery q context
      either (pure . Left) (publish refs (infoTitle current) [view | view<-available,infoView view/=infoView current]) doc
  where
    publish refs title others value=do
      prepared<-prepareDoc value
      case prepared of
        Left err->pure (Left (T.pack (show err)))
        Right ready->do
          built<-buildPageWithBack refs subject title others ready (not (null history))
          case built of
            Left err->pure (Left err)
            Right (Page window actions)->do
              update<-W.openWindow (inspectorScope inspector) window
              case update of
                Nothing->pure (Left "Inspector scope closed.")
                Just opened->remember (W.updateWindowRef opened) actions >> pure (Right opened)
    remember reference actions=do
      pages<-readIORef (inspectorPages inspector)
      live<-filterM (W.windowRefCurrent . fst) pages
      writeIORef (inspectorPages inspector) (take 64 ((reference,(actions,take 32 ((subject,requested):history))):live))

-- | Follow an exact live row, preserving history across navigation and view
-- switches. Back consumes one location, so it cannot create a Back/Back loop.
followInspectorRow :: Inspector -> InspectContext -> W.WindowRef -> Tree.NodeId -> IO (Either Text W.WindowUpdate)
followInspectorRow inspector context reference node
  | inspectOrigin context/=Menu.HumanMenu=pure (Left "Inspector navigation requires human input.")
  | otherwise=do
      action<-pageAction inspector reference node
      pages<-readIORef (inspectorPages inspector)
      let trail=maybe [] snd (lookup reference pages)
      case action of
        Just (Navigate subject)->enter subject Nothing trail
        Just (ShowView subject view)->enter subject (Just view) (drop 1 trail)
        Just GoBack->case drop 1 trail of
          (subject,view):earlier->enter subject view earlier
          []->pure (Left "No earlier inspector location.")
        Just (OpenPath _)->pure (Left "Open files from the Files or Package tree.")
        Nothing->pure (Left "Inspector row expired; reopen it.")
  where
    enter subject view earlier=do
      resolved<-resolve (inspectorViews inspector) subject
      case resolved of
        Gone->pure (Left "That object no longer exists; reopen the inspector.")
        RootRetired->pure (Left "That object's source is no longer available.")
        Fresh current->inspectWithHistory inspector context current view earlier
