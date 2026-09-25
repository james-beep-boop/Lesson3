/** An explicit capture slot, kept visually distinct from a real product screenshot. */
export default function GuideScreenshot({ description }: { description: string }) {
  return (
    <figure className="guide-screenshot">
      <div
        className="guide-screenshot__placeholder"
        role="img"
        aria-label={`Screenshot to be added: ${description}`}
      >
        <span className="guide-screenshot__label">Screenshot to be added</span>
        <span className="guide-screenshot__description">{description}</span>
      </div>
      <figcaption>{description}</figcaption>
    </figure>
  )
}
