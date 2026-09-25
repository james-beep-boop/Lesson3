import Image from 'next/image'

type GuideScreenshotProps = {
  src: string
  alt: string
  description: string
  width: number
  height: number
}

export default function GuideScreenshot({
  src,
  alt,
  description,
  width,
  height,
}: GuideScreenshotProps) {
  return (
    <figure className="guide-screenshot">
      <Image
        className={`guide-screenshot__image${height > width ? ' guide-screenshot__image--phone' : ''}`}
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(max-width: 900px) 100vw, 900px"
      />
      <figcaption>{description}</figcaption>
    </figure>
  )
}
