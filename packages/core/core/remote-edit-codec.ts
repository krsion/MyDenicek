import type { PlainNode } from "./nodes.ts";
import type { PrimitiveValue } from "./selector.ts";
import type { Edit } from "./edits/base.ts";

/** Serializable edit payload stored inside a public {@link RemoteEvent}. */
export type EncodedRemoteEdit =
  | { kind: "RecordAddEdit"; target: string; node: PlainNode }
  | { kind: "RecordDeleteEdit"; target: string }
  | { kind: "RecordRenameFieldEdit"; target: string; to: string }
  | { kind: "SetValueEdit"; target: string; value: PrimitiveValue }
  | { kind: "ApplyPrimitiveEdit"; target: string; editName: string }
  | { kind: "ListPushBackEdit"; target: string; node: PlainNode }
  | { kind: "ListPushFrontEdit"; target: string; node: PlainNode }
  | { kind: "ListPopBackEdit"; target: string }
  | { kind: "ListPopFrontEdit"; target: string }
  | { kind: "UpdateTagEdit"; target: string; tag: string }
  | { kind: "WrapRecordEdit"; target: string; field: string; tag: string }
  | { kind: "WrapListEdit"; target: string; tag: string }
  | { kind: "CopyEdit"; target: string; source: string }
  | { kind: "NoOpEdit"; target: string; reason: string };

type RemoteEditDecoder<
  TEncodedEdit extends EncodedRemoteEdit = EncodedRemoteEdit,
> = (encodedEdit: TEncodedEdit) => Edit;

const remoteEditDecoders = new Map<
  EncodedRemoteEdit["kind"],
  RemoteEditDecoder
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function registerRemoteEditDecoder<
  TEncodedEdit extends EncodedRemoteEdit,
>(
  kind: TEncodedEdit["kind"],
  decoder: RemoteEditDecoder<TEncodedEdit>,
): void {
  if (remoteEditDecoders.has(kind)) {
    throw new Error(`Remote edit decoder '${kind}' is already registered.`);
  }
  remoteEditDecoders.set(kind, decoder as RemoteEditDecoder);
}

export function decodeRemoteEdit(encodedEdit: EncodedRemoteEdit): Edit {
  if (!isRecord(encodedEdit) || typeof encodedEdit.kind !== "string") {
    throw new Error(
      "decodeRemoteEdit: encoded edit must be an object with a string kind.",
    );
  }
  const decoder = remoteEditDecoders.get(encodedEdit.kind);
  if (decoder === undefined) {
    throw new Error(
      `decodeRemoteEdit: unknown edit kind "${encodedEdit.kind}".`,
    );
  }
  return decoder(encodedEdit);
}
