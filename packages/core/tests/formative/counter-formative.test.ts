import { assertEquals } from "@std/assert";
import { Denicek } from "../../mod.ts";

type FormulaNode =
  | number
  | {
    $tag: "x-formula-plus";
    left: FormulaNode;
    right: FormulaNode;
  };

Deno.test("Formative: Counter App", () => {
  const peer = new Denicek("alice", {
    $tag: "app",
    formula: 1,
    btn: {
      $tag: "button",
      label: "Add 1",
      script: {
        $tag: "replay-script",
        steps: { $tag: "event-steps", $items: [] },
      },
    },
  });

  const evaluateFormula = (formula: FormulaNode): number =>
    typeof formula === "number"
      ? formula
      : evaluateFormula(formula.left) + evaluateFormula(formula.right);

  const clickButton = (): void => {
    peer.repeatEditsFrom("btn/script/steps");
  };

  const wrapEventId = peer.wrapRecord("formula", "formula", "x-formula-plus");
  const renameEventId = peer.rename("formula", "formula", "left");
  const addRightEventId = peer.add("formula", "right", 1);

  peer.insert("btn/script/steps", -1, {
    $tag: "replay-step",
    eventId: wrapEventId,
  }, true);
  peer.insert("btn/script/steps", -1, {
    $tag: "replay-step",
    eventId: renameEventId,
  }, true);
  peer.insert("btn/script/steps", -1, {
    $tag: "replay-step",
    eventId: addRightEventId,
  }, true);

  {
    const plainDocument = peer.toPlain() as unknown as {
      formula: FormulaNode;
      btn: { script: { steps: { $items: Array<{ eventId: string }> } } };
    };
    assertEquals(
      plainDocument.btn.script.steps.$items.map((step) => step.eventId),
      [
        wrapEventId,
        renameEventId,
        addRightEventId,
      ],
    );
    assertEquals(evaluateFormula(plainDocument.formula), 2);
  }

  clickButton();
  {
    const formula = (peer.toPlain() as unknown as { formula: FormulaNode })
      .formula;
    const expected: FormulaNode = {
      $tag: "x-formula-plus",
      left: { $tag: "x-formula-plus", left: 1, right: 1 },
      right: 1,
    };
    assertEquals(formula, expected);
    assertEquals(evaluateFormula(expected), 3);
  }

  peer.wrapRecord("formula", "math", "paragraph");
  clickButton();

  {
    const formula =
      (peer.toPlain() as unknown as { formula: { math: FormulaNode } })
        .formula.math;
    const expected: FormulaNode = {
      $tag: "x-formula-plus",
      left: {
        $tag: "x-formula-plus",
        left: { $tag: "x-formula-plus", left: 1, right: 1 },
        right: 1,
      },
      right: 1,
    };
    assertEquals(formula, expected);
    assertEquals(evaluateFormula(expected), 4);
  }
});
