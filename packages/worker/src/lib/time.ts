import { formatDistanceToNow, format } from "date-fns";

const relativeTime = (timestamp: number): string => {
  return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
};

const formatTimestamp = (timestamp: number): string => {
  return format(new Date(timestamp * 1000), "MMM d, yyyy 'at' h:mm a");
};

export { relativeTime, formatTimestamp };
