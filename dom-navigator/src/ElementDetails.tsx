import { Button, Card, Input, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text } from "@fluentui/react-components";
import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { useState } from "react";

export function ElementDetails({ details, attributes, onAttributeChange }: {
  details: { tag: string; id: string | null; guid?: string | null; classes: string[]; width: number; height: number; dataTestId: string | null; value?: string | undefined; } | null,
  attributes?: Record<string, unknown> | undefined,
  onAttributeChange?: ((key: string, value: string | undefined) => void) | undefined
}) {
  const [newAttrKey, setNewAttrKey] = useState("");
  const [newAttrValue, setNewAttrValue] = useState("");

  if (!details) return null;

  return <Card>
    <Table size="extra-small">
      <TableBody>
        <TableRow>
          <TableCell>Tag</TableCell>
          <TableCell>{details.tag}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>GUID</TableCell>
          <TableCell>{details.guid ?? <span style={{ color: "#999" }}>(none)</span>}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Id</TableCell>
          <TableCell>{details.id ?? <span style={{ color: "#999" }}>(none)</span>}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Classes</TableCell>
          <TableCell>{details.classes.length ? details.classes.join(" ") : <span style={{ color: "#999" }}>(none)</span>}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Size</TableCell>
          <TableCell>{details.width} × {details.height}px</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>data-testid</TableCell>
          <TableCell>{details.dataTestId ?? <span style={{ color: "#999" }}>(none)</span>}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Value</TableCell>
          <TableCell>{details.value ?? <span style={{ color: "#999" }}>(empty)</span>}</TableCell>
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
              <TableRow key={key}>
                <TableCell>{key}</TableCell>
                <TableCell>
                  <Input
                    value={String(value)}
                    onChange={(_e, data) => onAttributeChange(key, data.value)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    icon={<DeleteRegular />}
                    size="small"
                    appearance="subtle"
                    onClick={() => onAttributeChange(key, undefined)}
                  />
                </TableCell>
              </TableRow>
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
