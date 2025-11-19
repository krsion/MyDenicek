import { Card, Table, TableRow, TableCell, TableBody } from "@fluentui/react-components";

export function ElementDetails({ details }: { details: { tag: string; id: string | null; guid?: string | null; classes: string[]; width: number; height: number; dataTestId: string | null; value?: string | number; } | null }) {
  return <Card>
    <Table size="extra-small">
      <TableBody>
        <TableRow>
          <TableCell>Tag</TableCell>
          <TableCell>{details?.tag}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>GUID</TableCell>
          <TableCell>{details?.guid ?? <span style={{ color: "#999" }}>(none)</span>}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Id</TableCell>
          <TableCell>{details?.id ?? <span style={{ color: "#999" }}>(none)</span>}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Classes</TableCell>
          <TableCell>{details?.classes.length ? details.classes.join(" ") : <span style={{ color: "#999" }}>(none)</span>}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Size</TableCell>
          <TableCell>{details?.width} × {details?.height}px</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>data-testid</TableCell>
          <TableCell>{details?.dataTestId ?? <span style={{ color: "#999" }}>(none)</span>}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Value</TableCell>
          <TableCell>{details?.value ?? <span style={{ color: "#999" }}>(empty)</span>}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </Card>;
}
