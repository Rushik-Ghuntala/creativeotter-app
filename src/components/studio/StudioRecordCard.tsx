import Link from "next/link"
import Image from "next/image"
import {
  ArrowUpRight,
  UserRound,
  Film,
  AudioLines,
  Music2,
  Folder,
  Palette,
} from "lucide-react"
import type { StudioRecord, StudioSection } from "@/lib/studio/contracts"
const icons = {
  characters: UserRound,
  films: Film,
  voices: AudioLines,
  music: Music2,
  projects: Folder,
  brands: Palette,
}
type StudioRecordCardProps = {
  record: StudioRecord
  section: StudioSection
  imageUrl?: string
  charged?: string
}
export const StudioRecordCard = ({
  record,
  section,
  imageUrl,
  charged,
}: StudioRecordCardProps) => {
  const Icon = icons[section]
  return (
    <Link
      href={`/studio/${section}/${record.id}`}
      className={`studio-record-card record-${section}`}
    >
      {imageUrl ? (
        <div className="record-image">
          <Image
            src={imageUrl}
            width={500}
            height={500}
            alt={record.name}
            unoptimized
          />
        </div>
      ) : (
        <div className="record-art">
          <Icon size={38} />
          {"colors" in record && (
            <div className="brand-swatches">
              {record.colors.map((c) => (
                <i
                  key={c}
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <div className="record-card-body">
        <div>
          <h3>{record.name}</h3>
          <ArrowUpRight size={17} />
        </div>
        <p>
          {record.description ||
            `Your saved ${section === "characters" ? "character identity" : "creative direction"}.`}
        </p>
        <footer>
          <span>
            {"status" in record
              ? record.status.replaceAll("_", " ")
              : section === "characters"
                ? "Reusable identity"
                : section === "brands"
                  ? "Brand kit"
                  : "Voice direction"}
          </span>
          <span>
            {charged
              ? `${charged} credits`
              : new Date(record.updated_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
          </span>
        </footer>
      </div>
    </Link>
  )
}
