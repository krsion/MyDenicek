import { assertEquals } from "@std/assert";

Deno.test("determinism check passes", async () => {
  const cmd = new Deno.Command("deno", {
    args: ["run", "--allow-read", "tools/check-determinism.ts"],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await cmd.output();
  const stderr = new TextDecoder().decode(result.stderr);
  assertEquals(result.code, 0, `Determinism check failed:\n${stderr}`);
});
