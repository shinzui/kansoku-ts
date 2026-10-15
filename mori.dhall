let Schema =
      https://raw.githubusercontent.com/shinzui/mori-schema/3522f4a51181d73c9c90fc27a7c0838bd29ae95f/package.dhall
        sha256:dcb19e2312e790bad14e622cc98a1281cd2298c5b564a2f0d0534d3c718d8803

in  Schema.Project::{
    , project = Schema.ProjectIdentity::{
      , name = "kansoku-ts"
      , namespace = "shinzui"
      , stableId = Some "project_01m4yms1bweeaa374btkngeyg8"
      , type = Schema.PackageType.Library
      , language = Schema.Language.TypeScript
      , lifecycle = Schema.Lifecycle.Experimental
      , description = Some
          "TypeScript browser SDKs for the Kansoku analytics service — kansoku-js (core client, page views, sessions, identity, batched delivery) and kansoku-react (provider and hooks)"
      , domains = [ "Analytics", "Frontend", "SDK" ]
      , owners = [ "shinzui" ]
      }
    , repos =
      [ Schema.Repo::{ name = "kansoku-ts", github = Some "shinzui/kansoku-ts" } ]
    , packages =
      [ Schema.Package::{
        , name = "kansoku-js"
        , type = Schema.PackageType.Client
        , language = Schema.Language.TypeScript
        , path = Some "packages/kansoku-js"
        , description = Some
            "Dependency-free browser client for Kansoku ingest: event envelope, anonymous/session identity, batching, retries, exit flush, page-view and experiment capture"
        , runtimeEnvironment = Some (Schema.RuntimeEnvironment.Other "Browser")
        , apiSource = Some Schema.ApiSource::{
          , project = "shinzui/kansoku"
          , specPath = Some "docs/api/openapi.json"
          }
        }
      , Schema.Package::{
        , name = "kansoku-react"
        , type = Schema.PackageType.Library
        , language = Schema.Language.TypeScript
        , path = Some "packages/kansoku-react"
        , description = Some
            "React bindings for kansoku-js: KansokuProvider, useKansoku, useTrack, usePageView, useIdentify, useExperiment"
        , runtimeEnvironment = Some (Schema.RuntimeEnvironment.Other "Browser")
        , dependencies = [ Schema.Dependency.ByName "kansoku-js" ]
        }
      ]
    , okfBundles =
      [ Schema.OkfBundle::{
        , name = "adrs"
        , path = "docs/adr"
        , okfVersion = "0.2"
        , profile = Some "docs/adr/profile.dhall"
        , description = Some "Durable architecture decisions for the Kansoku browser SDKs"
        }
      ]
    , dependencies = [ "shinzui/kansoku", "openapi-ts/openapi-typescript" ]
    }
