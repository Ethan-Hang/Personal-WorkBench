import type { Annotation } from '../../../contract.js';
import {
  pdfQuadToViewportBounds,
  pdfRectToViewportBounds,
  type PdfCoordinateViewport,
} from '../anchor.js';

function annotationColor(annotation: Annotation): string {
  return annotation.color ?? '#facc15';
}

export function AnnotationOverlay({
  annotations,
  viewport,
}: {
  annotations: Annotation[];
  viewport: PdfCoordinateViewport;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" aria-hidden="true">
      {annotations.flatMap((annotation) => {
        const color = annotationColor(annotation);
        const reviewClass =
          annotation.status === 'needs-review' ? 'outline outline-1 outline-red-500' : '';
        if (annotation.kind === 'bookmark' && annotation.anchor.quads.length === 0) {
          return [
            <div
              key={annotation.id}
              data-annotation-id={annotation.id}
              data-annotation-kind={annotation.kind}
              className={`absolute right-2 top-0 h-8 w-4 rounded-b-sm ${reviewClass}`}
              style={{ backgroundColor: color }}
            />,
          ];
        }
        if (annotation.anchor.rect) {
          const bounds = pdfRectToViewportBounds(annotation.anchor.rect, viewport);
          return [
            <div
              key={annotation.id}
              data-annotation-id={annotation.id}
              data-annotation-kind={annotation.kind}
              className={`absolute ${
                annotation.kind === 'note'
                  ? 'rounded-full border-2 border-white shadow-sm'
                  : 'border-2 bg-transparent'
              } ${reviewClass}`}
              style={{
                left: bounds.left,
                top: bounds.top,
                width: annotation.kind === 'note' ? Math.max(14, bounds.width) : bounds.width,
                height: annotation.kind === 'note' ? Math.max(14, bounds.height) : bounds.height,
                borderColor: color,
                backgroundColor: annotation.kind === 'note' ? color : undefined,
              }}
            />,
          ];
        }
        return annotation.anchor.quads.map((quad, index) => {
          const bounds = pdfQuadToViewportBounds(quad, viewport);
          const shared = {
            left: bounds.left,
            top: bounds.top,
            width: Math.max(1, bounds.width),
            height: Math.max(1, bounds.height),
          };
          if (annotation.kind === 'underline' || annotation.kind === 'strikeout') {
            return (
              <div
                key={`${annotation.id}-${index}`}
                data-annotation-id={annotation.id}
                data-annotation-kind={annotation.kind}
                className={`absolute ${reviewClass}`}
                style={{
                  ...shared,
                  borderBottom: `2px solid ${color}`,
                  transform:
                    annotation.kind === 'strikeout' ? 'translateY(-50%)' : 'translateY(-1px)',
                }}
              />
            );
          }
          return (
            <div
              key={`${annotation.id}-${index}`}
              data-annotation-id={annotation.id}
              data-annotation-kind={annotation.kind}
              className={`absolute mix-blend-multiply ${reviewClass}`}
              style={{ ...shared, backgroundColor: color, opacity: 0.34 }}
            />
          );
        });
      })}
    </div>
  );
}
