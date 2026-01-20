import { Button, Card, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text } from "@fluentui/react-components";
import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import type { SelectedNodeDetails } from "@mydenicek/react-v2";
import { useEffect, useState } from "react";

import { NodeId } from "./components/NodeId";

function AttributeRow({ attrKey, value, onSave, onDelete }: { attrKey: string, value: unknown, onSave: (key: string, value: unknown) => void, onDelete: (key: string) => void }) {
  const [localValue, setLocalValue] = useState(typeof value === 'object' ? JSON.stringify(value) : String(value));

  useEffect(() => {
    setLocalValue(typeof value === 'object' ? JSON.stringify(value) : String(value));
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      let newValue: unknown = localValue;
      if (attrKey === "style") {
        try {
          newValue = JSON.parse(localValue);
        } catch {
          // ignore
        }
      }
      onSave(attrKey, newValue);
    }
  };

  return (
    <TableRow>
      <TableCell>{attrKey}</TableCell>
      <TableCell>
        <Input
          value={localValue}
          onChange={(_e, data) => setLocalValue(data.value)}
          onKeyDown={handleKeyDown}
          size="small"
        />
      </TableCell>
      <TableCell>
        <Button
          icon={<DeleteRegular />}
          size="small"
          appearance="subtle"
          onClick={() => onDelete(attrKey)}
        />
      </TableCell>
    </TableRow>
  );
}

export function ElementDetails({ details, attributes, onAttributeChange, onIdClick }: {
  details: SelectedNodeDetails | null | undefined,
  attributes?: Record<string, unknown> | undefined,
  onAttributeChange?: ((key: string, value: unknown | undefined) => void) | undefined,
  onIdClick?: (id: string) => void
}) {
  const [newAttrKey, setNewAttrKey] = useState("");
  const [newAttrValue, setNewAttrValue] = useState("");

  if (!details) return null;

  const displayTag = details.tag || details.dom?.tagName || "";
  const displayValue = details.value;
  const classes = details.dom?.classes || [];
  const width = details.dom?.width || 0;
  const height = details.dom?.height || 0;
  const dataTestId = details.attrs?.["data-testid"] || null;

  return <Card>
    <Table size="extra-small">
      <TableBody>
        <TableRow>
          <TableCell>Tag</TableCell>
          <TableCell>{displayTag}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>GUID</TableCell>
          <TableCell>
            {details.id ? (
              <NodeId id={details.id} onClick={onIdClick} />
            ) : (
              <span style={{ color: "#999" }}>(none)</span>
            )}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Classes</TableCell>
          <TableCell>{classes.length ? classes.join(" ") : <span style={{ color: "#999" }}>(none)</span>}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Size</TableCell>
          <TableCell>{width} × {height}px</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>data-testid</TableCell>
          <TableCell>{dataTestId ?? <span style={{ color: "#999" }}>(none)</span>}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Value</TableCell>
          <TableCell>{displayValue ?? <span style={{ color: "#999" }}>(empty)</span>}</TableCell>
        </TableRow>
      </TableBody>
    </Table>

    {attributes && onAttributeChange && (
      <>
        <Text weight="semibold" style={{ marginTop: 10, display: "block" }}>Attributes</Text>
        <Table size="extra-small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Key</TableHeaderCell>
              <TableHeaderCell>Value</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(attributes).map(([key, value]) => (
              <AttributeRow
                key={key}
                attrKey={key}
                value={value}
                onSave={onAttributeChange}
                onDelete={(k) => onAttributeChange(k, undefined)}
              />
            ))}
            <TableRow>
              <TableCell>
                <Input
                  placeholder="New key"
                  value={newAttrKey}
                  onChange={(_e, data) => setNewAttrKey(data.value)}
                  size="small"
                />
              </TableCell>
              <TableCell>
                <Input
                  placeholder="New value"
                  value={newAttrValue}
                  onChange={(_e, data) => setNewAttrValue(data.value)}
                  size="small"
                />
              </TableCell>
              <TableCell>
                <Button
                  icon={<AddRegular />}
                  size="small"
                  disabled={!newAttrKey}
                  onClick={() => {
                    onAttributeChange(newAttrKey, newAttrValue);
                    setNewAttrKey("");
                    setNewAttrValue("");
                  }}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </>
    )}
  </Card>;
}
