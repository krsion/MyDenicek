/**
 * @module
 * CRDT engine for collaborative editing of tagged document trees.
 *
 * The main entry point is the {@linkcode Denicek} class which manages
 * an event DAG with vector clocks and operational transformation.
 *
 * ```ts
 * import { Denicek } from "@mydenicek/core";
 *
 * const dk = new Denicek("peer-1");
 * dk.add("", "root", { $tag: "section" });
 * dk.add("root", "title", "Hello world");
 * console.log(dk.materialize());
 * ```
 */
export * from "./core.ts";
