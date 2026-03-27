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
    typeof formula === "number" ? formula : evaluateFormula(formula.left) + evaluateFormula(formula.right);

  const clickButton = (): void => {
    const plainDocument = peer.toPlain() as {
      btn: {
        script: {
          steps: {
            $items: Array<{ eventId: string }>;
          };
        };
      };
    };
    for (const step of plainDocument.btn.script.steps.$items) {
      peer.repeatEditFromEventId(step.eventId);
    }
  };

  const wrapEventId = peer.wrapRecord("formula", "formula", "x-formula-plus");
  const renameEventId = peer.rename("formula", "formula", "left");
  const addRightEventId = peer.add("formula", "right", 1);

  peer.pushBack("btn/script/steps", { $tag: "replay-step", eventId: wrapEventId });
  peer.pushBack("btn/script/steps", { $tag: "replay-step", eventId: renameEventId });
  peer.pushBack("btn/script/steps", { $tag: "replay-step", eventId: addRightEventId });

  {
    const plainDocument = peer.toPlain() as {
      formula: FormulaNode;
      btn: { script: { steps: { $items: Array<{ eventId: string }> } } };
    };
    assertEquals(plainDocument.btn.script.steps.$items.map((step) => step.eventId), [
      wrapEventId,
      renameEventId,
      addRightEventId,
    ]);
    assertEquals(evaluateFormula(plainDocument.formula), 2);
  }

  clickButton();
  {
    const plainDocument = peer.toPlain() as {
      formula: FormulaNode;
      btn: { script: { steps: { $items: Array<{ eventId: string }> } } };
    };
    assertEquals(plainDocument.btn.script.steps.$items.map((step) => step.eventId), [
      wrapEventId,
      renameEventId,
      addRightEventId,
    ]);
    assertEquals(evaluateFormula(plainDocument.formula), 3);
  }

  clickButton();

  assertEquals(peer.toPlain(), {
    $tag: "app",
    formula: {
      $tag: "x-formula-plus",
      left: {
        $tag: "x-formula-plus",
        left: {
          $tag: "x-formula-plus",
          left: 1,
          right: 1,
        },
        right: 1,
      },
      right: 1,
    },
    btn: {
      $tag: "button",
      label: "Add 1",
      script: {
        $tag: "replay-script",
        steps: {
          $tag: "event-steps",
          $items: [
            { $tag: "replay-step", eventId: wrapEventId },
            { $tag: "replay-step", eventId: renameEventId },
            { $tag: "replay-step", eventId: addRightEventId },
          ],
        },
      },
    },
  });
});
