-- SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
{-# LANGUAGE OverloadedStrings #-}
-- |
-- Module      : Hide.InspectorMenu
-- Copyright   : (c) 2026 Edward Kmett
-- License     : BSD-2-Clause OR Apache-2.0
-- Maintainer  : Edward Kmett <ekmett@gmail.com>
-- Stability   : experimental
-- Portability : OverloadedStrings
--
-- The inspector's row action on the existing menu worker.
--
-- @hide.inspect.open@ is a human-only contribution to @context.window-rows@. It
-- reads the row captured when the context menu opened, looks that exact
-- @(WindowRef, NodeId)@ up in the inspector's own page table, re-resolves the
-- target object through its typed path, and prepares the next inspector window
-- on the menu worker. The host adopts that window through its ordinary
-- 'PreparedWindow' reply after rechecking the same window-row menu reference.
-- A stale row, a vanished object or a retired root is an ordinary refusal.
module Hide.InspectorMenu (withInspectorMenu) where

import Control.Exception (finally)
import Control.Monad (void)
import Data.Aeson (Value(Null))
import Hide.InspectorWindow
import Hide.MenuCommands (MenuHost,MenuContext(..),MenuReply(..),menuContributions)
import Hide.Plugin.Command
import Hide.Plugin.Inspect
import qualified Hide.Plugin.Menu as Menu
import qualified Hide.Plugin.Window as W
import Hide.SidebarCommands (SidebarContext(..))

-- | Register the Open row action for this inspector's lifetime. Windows opened
-- while it is registered list its reference; leaving the scope retires it.
withInspectorMenu :: MenuHost -> Inspector -> IO a -> IO a
withInspectorMenu host inspector action=withRegistry $ \registry->do
  command<-either (fail . show) pure =<< registerCommand registry (definition inspector)
  reference<-either (fail . show) pure =<< Menu.contributeMenu (menuContributions host)
    (Menu.MenuDef "hide.inspect.open" "context.window-rows" "inspect" 0 "Open" "" False
      (Menu.menuAction registry command (const (Right ())) (\_ update->pure (PreparedWindow update))))
  setOpenMenu inspector [reference]
  action `finally` (setOpenMenu inspector [] >> void (Menu.retireMenu (menuContributions host) reference))

definition :: Inspector -> CommandDef MenuContext () W.WindowUpdate
definition inspector=CommandDef "hide.inspect.open" "Open inspector row" unit result $ \context ()->
  if invocationOrigin context/=Menu.HumanMenu then pure (Left (CommandRejected "Inspector navigation requires human input."))
  else case invocationRow context of
    Nothing->pure (Left (CommandRejected "No inspector row was captured."))
    Just (reference,node)->do
      found<-pageAction inspector reference node
      let sidebar=invocationSidebar context
          inspectContext=InspectContext (invocationOrigin context) (sidebarContextWorkspace sidebar) (sidebarPrivatePaths sidebar)
      case found of
        Nothing->pure (Left (CommandRejected "Inspector row expired; reopen it."))
        Just (OpenPath _)->pure (Left (CommandRejected "Open files from the Files or Package tree."))
        Just (Navigate subject)->enter inspectContext subject Nothing
        Just (ShowView subject view)->enter inspectContext subject (Just view)
  where
    unit=Codec Null (const (Right ())) (const Null)
    result=Codec Null (const (Left "Inspector windows are host values.")) (const Null)
    enter inspectContext subject view=do
      resolved<-resolve (inspectorViews inspector) subject
      case resolved of
        Gone->pure (Left (CommandRejected "That object no longer exists; reopen the inspector."))
        RootRetired->pure (Left (CommandRejected "That object's source is no longer available."))
        Fresh current->either (Left . CommandRejected) Right <$> inspectSubject inspector inspectContext current view
