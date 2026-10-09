import { cn } from "@/lib/utils";

/*
 * "KG Finance", set the way the brand writes it: Cinzel, KG heavy, Finance
 * light.
 *
 * Cinzel has no lowercase, so "inance" comes out as small capitals — that is
 * what gives the light half its quieter size. The weights are 800 and 400:
 * 400 is Cinzel's lightest, and it is what the light half was chosen at.
 *
 * `enter` plays the entrance: each letter comes into focus out of a blur, one
 * after another. Screen readers get the name once, not letter by letter.
 */
const KG = "KG";
const FINANCE = "Finance";
const STAGGER_MS = 60;

function Letters({ text, from, enter }: { text: string; from: number; enter: boolean }) {
  return text.split("").map((ch, i) => (
    <span
      key={i}
      className="kg-wordmark-letter"
      style={enter ? { animationDelay: `${(from + i) * STAGGER_MS}ms` } : undefined}
    >
      {ch}
    </span>
  ));
}

export function Wordmark({ enter = false, className }: { enter?: boolean; className?: string }) {
  return (
    <span className={cn("kg-wordmark", enter && "kg-wordmark-enter", className)}>
      <span className="sr-only">KG Finance</span>
      <span aria-hidden>
        <span className="kg-wordmark-kg">
          <Letters text={KG} from={0} enter={enter} />
        </span>{" "}
        <span className="kg-wordmark-fin">
          <Letters text={FINANCE} from={KG.length} enter={enter} />
        </span>
      </span>
    </span>
  );
}
