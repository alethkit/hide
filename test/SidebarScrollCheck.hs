-- SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
{-# LANGUAGE OverloadedStrings #-}
-- |
-- Module      : SidebarScrollCheck
-- Copyright   : (c) 2026 Edward Kmett
-- License     : BSD-2-Clause OR Apache-2.0
-- Maintainer  : Edward Kmett <ekmett@gmail.com>
-- Stability   : experimental
-- Portability : OverloadedStrings
--
-- A long Files tree pushes later sections (Sessions, Agents, the package) below
-- the viewport. The sidebar must say so, offer a way to reach them by mouse and
-- keyboard, and keep its scroll offset valid when rows disappear.

module SidebarScrollCheck (checks) where

import Control.Monad (unless)
import qualified Data.Map.Strict as M
import qualified Data.Text as T
import qualified Graphics.Vty as V
import Hide.Bindings (BindingPlatform(..),BindingContext(..),bindingAction)
import Hide.Commands (platformBindings)
import Hide.Plugin.Command
import qualified Hide.Plugin.Tree as P
import Hide.Render (snapshot)
import Hide.Sidebar
import Hide.Model

check :: String -> Bool -> IO ()
check label ok=unless ok (error ("sidebar scroll check failed: "<>label))

ident :: T.Text -> P.NodeId
ident=either (error . T.unpack) id . P.nodeId

-- | Files (expanded, @n@ directories) followed by three collapsed sections.
fixture :: Int -> (Int,Int) -> IO Desktop
fixture n size=withRegistry $ \registry->do
  let register name label resource nodes=do
        let info=P.NodeInfo (ident name) label "" True resource
        provider<-P.registerTree registry ("test.scroll."<>name) (P.NodeDef info Nothing [])
          (\() _->pure (Right (P.NodePage nodes Nothing))) >>= either (error.show) pure
        pure (provider,info)
      directories=[P.NodeDef (P.NodeInfo (ident (T.pack (show i))) (T.pack ("dir"<>show i)) "📁" False (Just ("/w/dir"<>show i))) Nothing [] | i<-[1..n]]
  (files,filesInfo)<-register "files" "Files" (Just "/w") directories
  (sessions,sessionsInfo)<-register "sessions" "Sessions" Nothing []
  (agents,agentsInfo)<-register "agents" "Agents" Nothing []
  (package,packageInfo)<-register "package" "longtree" (Just "/w/longtree.cabal") []
  let roots=foldl (\tree (provider,info)->addRoot (P.treeReference provider) info Nothing [] tree) (emptySidebar "/w" 30 False)
        [(files,filesInfo),(sessions,sessionsInfo),(agents,agentsInfo),(package,packageInfo)]
      key=NodeKey (P.treeReference files) (P.infoId filesInfo)
      (loading,pending)=requestChildren (nodeHit key (treeNodes roots M.! key)) Nothing roots
      request=maybe (error "files request missing") id pending
  page<-P.loadChildren files () (P.ChildRequest (P.infoId filesInfo) Nothing) >>= either (error.show) pure
  loaded<-either (error.T.unpack) pure (adoptPage request [(P.nodeInfo node,Nothing,[]) | node<-P.pageNodes page] Nothing loading)
  prepared<-prepareProjection loaded
  pure (installSidebar (adoptProjection prepared loaded) (initialDesktop size))

treeOf :: Desktop -> Sidebar
treeOf d=maybe (error "no sidebar") id (sideTree d)

mouse :: V.Button -> Int -> Int -> Desktop -> Desktop
mouse button x y=fst . handleEvent (V.EvMouseDown x y button [])

press :: V.Key -> [V.Modifier] -> Desktop -> Desktop
press key mods=fst . handleEvent (V.EvKey key mods)

visible :: T.Text -> Desktop -> Bool
visible text d=text `T.isInfixOf` snapshot d

checks :: IO ()
checks=do
  d<-fixture 60 (100,30)
  let tree=treeOf d; rows=treeContentRows d; limit=treeScrollLimit d tree
  check "fixture is long: Files rows exceed the viewport and the package starts below it" (M.size (treeRows tree)==64 && rows<61 && limit==64-rows)
  check "section rows are found without walking the rows" (sectionIndices tree==[0,61,62,63])
  check "all three later sections are hidden at the top" (hiddenSections 0 rows tree==[61,62,63])
  check "a section that is wholly visible is not reported" (hiddenSections (63-rows) rows tree==[63] && hiddenSections limit rows tree==[])
  check "the package row is not visible before scrolling" (not (visible "longtree" d))
  check "unfocused overflowing sidebar shows the cue" (visible "↓ 3 more sections" d)
  check "unfocused overflowing sidebar shows its scrollbar" (visible "▲" d && visible "▼" d && not (treeFocused tree))
  -- Mouse: the wheel and the cue reach the package; hit testing follows the scroll.
  let wheeled=mouse V.BScrollDown 5 10 d
  check "wheel scrolls the unfocused sidebar" (treeScroll (treeOf wheeled)==3)
  let jumped=mouse V.BLeft 5 1 d
      after=treeOf jumped
  check "clicking the cue scrolls the next hidden section to the top (clamped)" (treeScroll after==min limit 61 && treeScroll after>0)
  check "the package root is visible after the cue" (visible "▶ longtree" jumped && not (visible "more section" jumped))
  check "cue click does not take focus or select a row" (not (treeFocused after) && treeSelected after==treeSelected tree)
  let packageY=2+62-treeScroll after
      selected=mouse V.BLeft 5 packageY jumped
  check "hit testing after scrolling selects the package row" (treeSelected (treeOf selected)==62 && treeFocused (treeOf selected))
  check "the cue targets the next hidden section, not the last" (take 1 (hiddenSections 36 rows tree)==[62])
  check "the cue disappears when no section is hidden" (hiddenSections (treeScroll after) rows after==[])
  -- Scrollbar clicks work while unfocused.
  let page=mouse V.BLeft 28 (2+rows-2) d
  check "unfocused scrollbar track pages the viewport" (treeScroll (treeOf page)==rows)
  -- Keyboard: Ctrl+Down/Up move between sections; End and PageDown still work.
  let focused=d {sideTree=Just tree {treeFocused=True}}
      down1=press V.KDown [V.MCtrl] focused
      down2=press V.KDown [V.MCtrl] down1
      down3=press V.KDown [V.MCtrl] (press V.KDown [V.MCtrl] down2)
  check "Ctrl+Down moves to the next section" (treeSelected (treeOf down1)==61 && treeSelected (treeOf down2)==62)
  check "Ctrl+Down scrolls the selected section into view" (treeSelected (treeOf down1)<treeScroll (treeOf down1)+rows && visible "▶ Sessions" down1)
  check "Ctrl+Down stops at the last section" (treeSelected (treeOf down3)==63)
  let up=press V.KUp [V.MCtrl] down2
  check "Ctrl+Up moves to the previous section" (treeSelected (treeOf up)==61)
  let within=press V.KUp [V.MCtrl] (focused {sideTree=Just tree {treeFocused=True,treeSelected=30}})
  check "Ctrl+Up within a section reaches its header" (treeSelected (treeOf within)==0)
  check "plain Down still moves one row" (treeSelected (treeOf (press V.KDown [] focused))==1)
  check "End reaches the package" (treeSelected (treeOf (press V.KEnd [] focused))==63)
  -- Live keys resolve through the compiled bindings before the hard-coded sidebar handler.
  let table=either (error . T.unpack) id (platformBindings [] TerminalPlatform M.empty) M.! (TerminalPlatform,SidebarKeys)
      bound=focused {keyBindings=either (error . T.unpack) id (platformBindings [] TerminalPlatform M.empty)}
  check "sidebar bindings name section and edge commands" (bindingAction table V.KDown [V.MCtrl]==Just (SidebarSection 1) && bindingAction table V.KUp [V.MCtrl]==Just (SidebarSection (-1)) && bindingAction table V.KEnd []==Just (SidebarEdge True) && bindingAction table V.KHome []==Just (SidebarEdge False))
  check "bound Ctrl+Down, End and Home drive the focused sidebar" (treeSelected (treeOf (press V.KDown [V.MCtrl] bound))==61 && treeSelected (treeOf (press V.KEnd [] bound))==63 && treeSelected (treeOf (press V.KHome [] (press V.KEnd [] bound)))==0)
  -- Offsets stay valid when rows disappear or the viewport changes.
  let atEnd=press V.KEnd [] focused
  check "End scrolls to the end" (treeScroll (treeOf atEnd)==limit)
  let collapsed=press V.KLeft [] (atEnd {sideTree=Just (treeOf atEnd) {treeSelected=0}})
  check "collapsing Files from the end keeps the viewport valid" (treeScroll (treeOf collapsed)<=treeScrollLimit collapsed (treeOf collapsed) && M.size (treeRows (treeOf collapsed))==4)
  check "collapsed tree shows Files and every section, without cue" (visible "Files" collapsed && visible "longtree" collapsed && not (visible "more section" collapsed))
  let (grown,_)=handleEvent (V.EvResize 100 80) atEnd
  check "growing the window clamps the scroll offset" (treeScroll (treeOf grown)<=treeScrollLimit grown (treeOf grown) && treeScroll (treeOf grown)==0)
  let (shrunk,_)=handleEvent (V.EvResize 100 20) d
      shrunkTree=treeOf shrunk
  check "shrinking the window keeps the cue and counts sections" (visible "↓ 3 more sections" shrunk && treeScroll shrunkTree<=treeScrollLimit shrunk shrunkTree)
  -- Narrow sidebar: the cue is shortened rather than overlapping the dock button.
  let narrow=d {sideTree=Just tree {treeWidth=16}}
  check "narrow sidebar uses the short cue" (visible "↓ 3 more" narrow && not (visible "↓ 3 more sections" narrow))
  -- A short tree has neither cue nor scrollbar when unfocused.
  short<-fixture 3 (100,30)
  check "short tree shows neither cue nor scrollbar" (not (visible "more section" short) && not (visible "▲" short) && visible "longtree" short)
  -- One hidden section is singular.
  check "one hidden section is singular" (visible "↓ 1 more section" d {sideTree=Just tree {treeScroll=63-rows}} && not (visible "↓ 1 more sections" d {sideTree=Just tree {treeScroll=63-rows}}))
  putStrLn "sidebar scroll checks passed (section cue, unfocused scrollbar, cue/keyboard/wheel reach, valid offsets)"
