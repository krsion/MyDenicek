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
            $items: Array<{ eventId: string; target: string }>;
          };
        };
      };
    };
    for (const step of plainDocument.btn.script.steps.$items) {
      peer.replayEditFromEvent(step.eventId, step.target);
    }
  };

  peer.wrapRecord("formula", "formula", "x-formula-plus");
  peer.rename("formula", "formula", "left");
  peer.add("formula", "right", 1);

  const wrapEvent = peer.inspectEvents().find((event) =>
    event.editKind === "WrapRecord" && event.target === "formula"
  );
  const renameEvent = peer.inspectEvents().find((event) =>
    event.editKind === "RecordRenameField" && event.target === "formula/formula"
  );
  const addRightEvent = peer.inspectEvents().find((event) =>
    event.editKind === "RecordAdd" && event.target === "formula/right"
  );
  if (wrapEvent === undefined || renameEvent === undefined || addRightEvent === undefined) {
    throw new Error("Expected wrap, rename, and add events for the initial 1 -> 1 + 1 transformation.");
  }

  peer.pushBack("btn/script/steps", { $tag: "replay-step", eventId: wrapEvent.id, target: "formula" });
  peer.pushBack("btn/script/steps", { $tag: "replay-step", eventId: renameEvent.id, target: "formula/formula" });
  peer.pushBack("btn/script/steps", { $tag: "replay-step", eventId: addRightEvent.id, target: "formula/right" });

  {
    const plainDocument = peer.toPlain() as {
      formula: FormulaNode;
      btn: { script: { steps: { $items: Array<{ target: string }> } } };
    };
    assertEquals(plainDocument.btn.script.steps.$items.map((step) => step.target), [
      "formula",
      "formula/formula",
      "formula/right",
    ]);
    assertEquals(evaluateFormula(plainDocument.formula), 2);
  }

  clickButton();
  {
    const plainDocument = peer.toPlain() as {
      formula: FormulaNode;
      btn: { script: { steps: { $items: Array<{ target: string }> } } };
    };
    assertEquals(plainDocument.btn.script.steps.$items.map((step) => step.target), [
      "formula",
      "formula/formula",
      "formula/right",
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
            { $tag: "replay-step", eventId: wrapEvent.id, target: "formula" },
            { $tag: "replay-step", eventId: renameEvent.id, target: "formula/formula" },
            { $tag: "replay-step", eventId: addRightEvent.id, target: "formula/right" },
          ],
        },
      },
    },
  });
});
