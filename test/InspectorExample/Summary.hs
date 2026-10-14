-- SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
{-# LANGUAGE OverloadedStrings #-}
-- Independently authored extension: no editor or original view-module changes.
module InspectorExample.Summary (contribution) where
import Hide.PackageSources
import Hide.Plugin.Inspect
contribution :: Contribution
contribution=attach "example.summary" [either (error . show) id $
  viewDef "example.package.summary" "Summary" 20 (\here->
    Ready (Text [Heading (sourcePackageName (hereValue here))]))]
