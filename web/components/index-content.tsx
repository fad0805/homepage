interface IndexContentProps {
  html: string;
  className?: string;
}

export function IndexContent({ html, className = "" }: IndexContentProps) {
  if (!html?.trim()) return null;

  return (
    <div
      className={`index-content${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
