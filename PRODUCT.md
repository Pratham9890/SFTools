# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Angular web app, also wrapped as a Tauri desktop app. Used on PC and on Android phones.)

## Users

Any Satisfactory player planning a factory, solo or in co-op. Typical user: hundreds of hours in the game, knows recipes, alternates, manifolds and belt tiers, and finds the current planner confusing anyway.

They use the planner in three situations, often in one session:
- alt-tabbed from the game on one PC,
- on a second monitor beside the game while building,
- on a phone propped up or in hand while playing on PC.

## Product Purpose

Plan one factory at a time: pick a product and rate, say what is already produced elsewhere (inputs such as surplus plastic), choose recipes, and get a buildable layout: which machines, how many, at what clock, on which belts, built in what order. Then build it in game without losing track, and in co-op split the work and mark what is built.

Success: a player can glance at the plan mid-build and know what to build next, how many machines, what comes in on which belt and where the output goes.

## Positioning

A fork of Satisfactory Tools (SFTools, MIT) that plans the way players actually build: manifold lines with one belt each, whole machines plus one underclocked, belt and pipe limits, miner setups, power-shard budgets, and live co-op claims and "built" marks without accounts.

## Operating Context

- One plan per product. Things made elsewhere go in as inputs. Players don't stack several end products in one plan.
- Building happens floor by floor, manifold by manifold, from ore up. The plan is consulted repeatedly during the build.
- Co-op: an invite link gives access; each building block can be claimed by one player and marked built.
- Co-op backend is Supabase. The UI rebuild branch must not be tied to one private Supabase project: the server is configurable, with a self-host guide.

## Capabilities and Constraints

All current features stay: production request, inputs, recipes and alternates, resources, machines, logistics (belt/pipe limits, Belt view line splitting, Custom belt modes), overclocking and shard budget, somersloops, sink, power, miner setups, preview before calculate, split/lock/mark done, subplans, plan folders, import/export, codex, map, co-op panel and claims.

- Default machine grouping stays "Underclock the last machine". No splitters/mergers in build cost. Typed rates not snapped.
- No confirm popups; no duplicated settings; never lose behaviour that was approved.
- Plans of 2,000 blocks must stay workable.

## Brand Commitments

- App name: "Satisfactory Tools".
- Dark theme.
- In-game item and building icons are used for items and machines.

## Evidence on Hand

- Game data (items, recipes, buildings, icons) ships with the app.
- User screenshots of their builds and their Belt view mock-ups: `C:\Users\Pratham\.t3\userdata\attachments\`.
- No user testimonials or usage numbers exist; don't invent them.

## Product Principles

1. The plan reads like the build: lines and floors in the order they are built, not an abstract graph.
2. Glanceable from across a desk: counts, machines, rates and belts are readable without hovering or zooming in.
3. Never lose your place: where you are, what's done and what's next are always visible.
4. One home per thing: every setting and action has exactly one place.
5. Same plan on PC, second monitor and phone.
