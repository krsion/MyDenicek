import { usePeerAlias } from "../context/PeerAliasContext";

interface NodeIdProps {
    id: string;
    onClick?: (id: string) => void;
}

export function NodeId({ id, onClick }: NodeIdProps) {
    const { formatNodeId } = usePeerAlias();
    const displayId = formatNodeId(id);

    return (
        <span
            style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                cursor: onClick ? 'pointer' : 'default',
                padding: '2px 4px',
                borderRadius: '3px',
                backgroundColor: onClick ? 'rgba(0, 120, 212, 0.1)' : 'transparent',
                transition: 'background-color 0.15s',
            }}
            onClick={onClick ? () => onClick(id) : undefined}
            onMouseEnter={(e) => {
                if (onClick) {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 120, 212, 0.2)';
                }
            }}
            onMouseLeave={(e) => {
                if (onClick) {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 120, 212, 0.1)';
                }
            }}
        >
            {displayId}
        </span>
    );
}
