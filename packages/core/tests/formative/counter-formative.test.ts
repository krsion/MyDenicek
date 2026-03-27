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
        target: { $ref: "/formula" },
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
          target: string;
          steps: {
            $items: Array<{ eventId: string; targetField: string }>;
          };
        };
      };
    };
    const baseTarget = plainDocument.btn.script.target;
    for (const step of plainDocument.btn.script.steps.$items) {
      const replayTarget = step.targetField === "self" ? baseTarget : `${baseTarget}/${step.targetField}`;
      peer.replayEditFromEvent(step.eventId, replayTarget);
    }
  };

  peer.wrapRecord("formula", "left", "x-formula-plus");
  peer.add("formula", "right", 1);

  const wrapEvent = peer.inspectEvents().find((event) =>
    event.editKind === "WrapRecord" && event.target === "formula"
  );
  const addRightEvent = peer.inspectEvents().find((event) =>
    event.editKind === "RecordAdd" && event.target === "formula/right"
  );
  if (wrapEvent === undefined || addRightEvent === undefined) {
    throw new Error("Expected wrap and add events for the initial 1 -> 1 + 1 transformation.");
  }

  peer.pushBack("btn/script/steps", { $tag: "replay-step", eventId: wrapEvent.id, targetField: "self" });
  peer.pushBack("btn/script/steps", { $tag: "replay-step", eventId: addRightEvent.id, targetField: "right" });

  {
    const plainDocument = peer.toPlain() as {
      formula: FormulaNode;
      btn: { script: { target: string } };
    };
    assertEquals(plainDocument.btn.script.target, "/formula/left");
    assertEquals(evaluateFormula(plainDocument.formula), 2);
  }

  clickButton();
  {
    const plainDocument = peer.toPlain() as {
      formula: FormulaNode;
      btn: { script: { target: string } };
    };
    assertEquals(plainDocument.btn.script.target, "/formula/left/left");
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
        target: "/formula/left/left/left",
        steps: {
          $tag: "event-steps",
          $items: [
            { $tag: "replay-step", eventId: wrapEvent.id, targetField: "self" },
            { $tag: "replay-step", eventId: addRightEvent.id, targetField: "right" },
          ],
        },
      },
    },
  });
});
