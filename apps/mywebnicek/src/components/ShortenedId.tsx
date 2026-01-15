import { Tooltip } from "@fluentui/react-components";

export interface ShortenedIdProps {
  id: string;
  onClick?: ((id: string) => void) | undefined;
  maxLength?: number | undefined;
}

/**
 * Shortens a Loro OpId like "0@12565144993514971130" to "0@125...130"
 */
function shortenId(id: string, maxLength: number = 16): string {
  // Check if it matches the OpId format: peer@counter
  const atIndex = id.indexOf('@');
  if (atIndex === -1) {
    // Not an OpId format, just truncate if needed
    if (id.length <= maxLength) return id;
    const keep = Math.floor((maxLength - 3) / 2);
    return `${id.slice(0, keep)}...${id.slice(-keep)}`;
  }

  const peer = id.slice(0, atIndex);
  const counter = id.slice(atIndex + 1);

  // If the whole thing is short enough, return as-is
  if (id.length <= maxLength) return id;

  // Shorten the counter part, keep the peer
  const availableForCounter = maxLength - peer.length - 1 - 3; // -1 for @, -3 for ...
  if (availableForCounter < 6) {
    // Not enough space, just show first few and last few of whole ID
    const keep = Math.floor((maxLength - 3) / 2);
    return `${id.slice(0, keep)}...${id.slice(-keep)}`;
  }

  const counterKeep = Math.floor(availableForCounter / 2);
  return `${peer}@${counter.slice(0, counterKeep)}...${counter.slice(-counterKeep)}`;
}

export function ShortenedId({ id, onClick, maxLength = 16 }: ShortenedIdProps) {
  const shortened = shortenId(id, maxLength);
  const isShortened = shortened !== id;

  const content = (
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
      {shortened}
    </span>
  );

  if (isShortened) {
    return (
      <Tooltip content={id} relationship="description">
        {content}
      </Tooltip>
    );
  }

  return content;
}
