import Badge from "./Badge";
import { getStatusTone } from "./utils";

export default function StatusBadge({ tone, status, children, className = "", size = "sm" }) {
  return (
    <Badge tone={tone || getStatusTone(status)} size={size} className={className}>
      {children || status}
    </Badge>
  );
}
