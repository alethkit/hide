-- SPDX-License-Identifier: BSD-2-Clause OR Apache-2.0
{-# LANGUAGE OverloadedStrings #-}
module InspectorSpecCheck (checks) where

import Control.Monad (unless)
import Data.Aeson (Value, object, (.=), encode, decode)
import qualified Data.ByteString.Char8 as BS
import Data.IORef
import Data.Text (Text)
import qualified Data.Vector as V
import Hide.InspectorWindow
import Hide.PackageInspect
import Hide.PackageSources
import Hide.Plugin.Inspect
import Hide.Plugin.Inspect.JSON
import Hide.Plugin.Menu (MenuOrigin(..))
import qualified Hide.Plugin.Tree as Tree
import qualified Hide.Plugin.Window as W
import qualified InspectorExample.Summary as Summary
import qualified InspectorExample.Counts as Counts

checks :: IO ()
checks=withInspector $ \inspector->do
  let check label ok=unless ok (error ("Inspector specification: "++label))
      publisher=inspectorPublisher' inspector
      registry=inspectorViews inspector
      human=InspectContext HumanMenu "/workspace" []
      package=either (error . show) id $ parsePackageSources $ BS.unlines
        ["cabal-version: 3.0","name: demo","version: 0.1","library",
         "  exposed-modules: Alpha","  hs-source-dirs: src"]
  revisions<-newIORef (Revision 1,package)
  root<-publishRoot publisher (RootDef "spec.package" (Just <$> readIORef revisions)) >>= either (error . show) pure
  Just top<-rootSubject registry root
  _<-publishPackageViews publisher
  summary<-publishViews publisher Summary.contribution >>= either (error . show) pure
  _<-publishViews publisher Counts.contribution >>= either (error . show) pure
  views<-viewsFor registry top
  check "two independent modules extend the existing package type"
    (map (viewIdText . infoView) views==["hide.package.components","hide.package.warnings","example.package.summary","example.package.counts"])
  withdrawViews publisher summary
  remaining<-viewsFor registry top
  check "retiring one independent extension preserves the other"
    ("example.package.counts" `elem` map (viewIdText . infoView) remaining && "example.package.summary" `notElem` map (viewIdText . infoView) remaining)

  -- Interpret the very same prepared value into the UI and JSON.
  Right (Ready doc)<-openView registry top (view "hide.package.components")
  Right ready<-prepareDoc doc
  Right page<-buildPage [] top "Components" [] ready
  let json=renderJSON ready
      expected=object ["document" .= object ["kind" .= ("list"::Text),
        "title" .= ("demo — 1 components"::Text),"items" .= [object
          ["label" .= ("lib:demo"::Text),"detail" .= detailOf doc,
           "action" .= object ["id" .= (0::Int),"kind" .= ("inspect"::Text),"type" .= ("ComponentSources"::Text)]]]],"omitted" .= (0::Int)]
  check "JSON preserves semantics of the shared document" (jsonValue json==expected)
  check "JSON round trips through an ordinary decoder" ((decode (encode (jsonValue json))::Maybe Value)==Just expected)
  check "the human interpreter uses the same row caption" (labels (pageWindow page)==["lib:demo"])
  check "out-of-range JSON actions do not resolve" (jsonTarget json (-1)==Nothing && jsonTarget json 1==Nothing)
  case jsonTarget json 0 of
    Just (Inspect child)->do
      check "JSON retains a typed navigation target" (fmap (sourceTarget . hereValue) (subjectAs child)==Just "lib:demo")
      childJSON<-openJSON registry child (view "hide.component.sources")
      check "JSON can inspect a child via the shared registry" (either (const False) (const True) childJSON)
    _->error "missing JSON child"
  Right facts<-prepareDoc (Text [Heading "Title",Prose "Body",Facts [("a","b"),("a","c")]])
  let factJSON=jsonValue (renderJSON facts)
  check "text interpreter preserves headings, prose and duplicate fact labels"
    (factJSON==object ["omitted" .= (0::Int),"document" .= object ["kind" .= ("text"::Text),"blocks" .=
      [object ["kind" .= ("heading"::Text),"text" .= ("Title"::Text)],
       object ["kind" .= ("prose"::Text),"text" .= ("Body"::Text)],
       object ["kind" .= ("facts"::Text),"facts" .= [object ["label" .= ("a"::Text),"value" .= (v::Text)] | v<-["b","c"]]]]]])
  Right bounded<-prepareDoc (List "Many" [Item "row" "detail" (Just (Inspect top)) | _<-[1..100::Int]])
  let boundedJSON=renderJSON bounded
  check "JSON respects preparation limits and the non-actionable omission row"
    (preparedOmitted bounded==37 && jsonTarget boundedJSON 62/=Nothing && jsonTarget boundedJSON 63==Nothing)

  -- Actual host navigation, including switching views without losing history.
  (topRef,topWindow)<-inspectSubject inspector human top Nothing >>= adopt
  (childRef,childWindow)<-followInspectorRow inspector human topRef (node "lib:demo" topWindow) >>= adopt
  check "child navigation offers Back" ("← Back" `elem` labels childWindow)
  (declRef,declWindow)<-followInspectorRow inspector human childRef (node "→ Declaration view" childWindow) >>= adopt
  (backRef,backWindow)<-followInspectorRow inspector human declRef (node "← Back" declWindow) >>= adopt
  check "Back after view switching restores the parent without a cycle"
    ("lib:demo" `elem` labels backWindow && "← Back" `notElem` labels backWindow)
  (sourceRef,sourceWindow)<-followInspectorRow inspector human childRef (node "Alpha (module)" childWindow) >>= adopt
  check "nested source navigation has history" ("← Back" `elem` labels sourceWindow)
  (_,parentWindow)<-followInspectorRow inspector human sourceRef (node "← Back" sourceWindow) >>= adopt
  check "nested Back restores the component" ("Alpha (module)" `elem` labels parentWindow)
  refused<-followInspectorRow inspector (InspectContext AgentMenu "/workspace" []) backRef (node "lib:demo" backWindow)
  check "history does not bypass human menu admission" (either (const True) (const False) refused)
  writeIORef revisions (Revision 2,package {sourceComponents=[]})
  gone<-followInspectorRow inspector human sourceRef (node "← Back" sourceWindow)
  check "Back re-resolves and refuses a removed ancestor" (either (const True) (const False) gone)
  Right freshJSON<-openJSON registry top (view "hide.package.components")
  check "JSON re-resolves revisions instead of exporting stale rows" (jsonTarget freshJSON 0==Nothing)
  withdrawRoot publisher root
  retired<-openJSON registry top (view "hide.package.components")
  check "JSON refuses retired roots" (either (const True) (const False) retired)
  putStrLn "original inspector specification checks passed (independent extensions, UI/JSON, navigation history)"
  where
    detailOf (List _ [Item _ detail _])=detail
    detailOf _=error "unexpected fixture"

view :: Text -> ViewId
view=either (error . show) id . mkViewId

labels :: W.PreparedWindow -> [Text]
labels window=case W.preparedWindowRows window of
  W.RowsDetails rows _ _->[label | W.WindowRow _ label _<-V.toList rows]
  _->error "expected rows"

node :: Text -> W.PreparedWindow -> Tree.NodeId
node wanted window=case W.preparedWindowRows window of
  W.RowsDetails rows _ _->case [ident | W.WindowRow ident label _<-V.toList rows,label==wanted] of
    [ident]->ident
    _->error ("missing unique row: "++show wanted)
  _->error "expected rows"

adopt :: Either Text W.WindowUpdate -> IO (W.WindowRef,W.PreparedWindow)
adopt (Left err)=error (show err)
adopt (Right update)=W.admitWindowUpdate False update >>= maybe (error "not admitted") pure
