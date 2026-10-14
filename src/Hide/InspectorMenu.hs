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
import Hide.SidebarCommands (SidebarContext(..))

-- | Register the Open row action for this inspector's lifetime. Windows opened
-- while it is registered list its reference; leaving the scope retires it.
withInspectorMenu :: MenuHost -> Inspector -> IO a -> IO a
withInspectorMenu host inspector action=withRegistry $ \registry->do
  command<-either (fail . show) pure =<< registerCommand registry (definition inspector)
  reference<-either (fail . show) pure =<< Menu.contributeMenu (menuContributions host)
    (Menu.MenuDef "hide.inspect.open" "context.window-rows" "inspect" 0 "Open" "" False
      (Menu.menuAction registry command (const (Right ())) (\_ followed->pure (case followed of Opened update->PreparedWindow update; Jump path row column expected->PreparedJump path row column expected))))
  setOpenMenu inspector [reference]
  action `finally` (setOpenMenu inspector [] >> void (Menu.retireMenu (menuContributions host) reference))

definition :: Inspector -> CommandDef MenuContext () Followed
definition inspector=CommandDef "hide.inspect.open" "Open inspector row" unit result $ \context ()->
  if invocationOrigin context/=Menu.HumanMenu then pure (Left (CommandRejected "Inspector navigation requires human input."))
  else case invocationRow context of
    Nothing->pure (Left (CommandRejected "No inspector row was captured."))
    Just (reference,node)->do
      let sidebar=invocationSidebar context
          inspectContext=InspectContext (invocationOrigin context) (sidebarContextWorkspace sidebar) (sidebarPrivatePaths sidebar)
      either (Left . CommandRejected) Right <$> followInspectorAction inspector inspectContext reference node
  where
    unit=Codec Null (const (Right ())) (const Null)
    result=Codec Null (const (Left "Inspector results are host values.")) (const Null)
