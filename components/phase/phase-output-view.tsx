import { PhaseType } from "@prisma/client";
import {
  BUSINESS_CASE_DEFAULTS,
  normalizeBusinessCaseOutput,
  type AssumptionStatus,
} from "@/lib/schemas/business-case";
import {
  BUSINESS_MODEL_DEFAULTS,
  normalizeBusinessModelOutput,
} from "@/lib/schemas/business-model";
import {
  PAIN_GAIN_DEFAULTS,
  normalizePainGainOutput,
  painCombinedScore,
} from "@/lib/schemas/pain-gain";
import {
  PERSONA_DEFAULTS,
  normalizePersonaOutput,
} from "@/lib/schemas/persona";
import {
  VALUE_PROP_DEFAULTS,
  normalizeValuePropOutput,
} from "@/lib/schemas/value-prop";
import { VISION_DEFAULTS, normalizeVisionOutput } from "@/lib/schemas/vision";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/*
 * Story 2.11 — the read-only phase output view (FR-5 review surface). A
 * Server Component: pure rendering of normalized output, zero client JS
 * (AD-9). This is the read-only counterpart of the 2.5–2.10 forms — labels
 * mirror the forms' own labels, values render as plain text/tables, and
 * nothing here is editable. It replaces the 2.3-era placeholder paragraph
 * for In Review / Approved phases (and Draft phases viewed by a Stakeholder).
 *
 * Deliberate omissions (story decision, flagged for Mar): the PainGain
 * ranking bar chart, the BMC gross-margin line, and ValueProp "Unresolved"
 * gap badges are EDITOR-side computed analytics, not stored output — the
 * review surface renders what the BA authored, not recomputed views.
 *
 * Empty-phase detection: every normalizeXxxOutput spreads its X_DEFAULTS
 * first, so key order is canonical — a stringify compare against the
 * defaults is a reliable "has data" check (same trick as the page's
 * Submit-button visibility gate).
 */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-label text-on-surface">{label}</p>
      <div className="mt-1 text-body text-on-surface">{children}</div>
    </div>
  );
}

function TextList({ items }: { items: string[] }) {
  const visible = items.filter((item) => item.trim() !== "");
  if (visible.length === 0) return null;
  return (
    <ul className="list-disc pl-5">
      {visible.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

// "n / 5" satisfaction-style value, matching the forms' slider scale readout.
function ScoreCell({ value, label }: { value: number; label: string }) {
  return (
    <span className="tabular-nums">
      <span className="sr-only">{label}: </span>
      {value} / 5
    </span>
  );
}

const STATUS_SELECTED_CLASSES: Record<AssumptionStatus, string> = {
  // Read-only chips reuse the 2.10 status colors minus the hover affordance
  // and the button semantics — a static badge, not a control.
  Confirmed: "border border-success bg-success-container text-on-success-container",
  Unconfirmed: "border border-warning bg-warning-container text-on-warning-container",
  Unknown: "border border-outline bg-surface text-on-surface",
};

export function PhaseOutputView({
  phaseType,
  output,
}: {
  phaseType: PhaseType;
  output: unknown;
}) {
  if (phaseType === PhaseType.Persona) {
    const data = normalizePersonaOutput(output);
    if (JSON.stringify(data) === JSON.stringify(PERSONA_DEFAULTS)) {
      return <p className="text-body text-on-surface-variant">No content yet.</p>;
    }
    return (
      <div className="flex flex-col gap-6">
        {data.customerName.trim() !== "" ? (
          <Section label="Customer name/identifier">{data.customerName}</Section>
        ) : null}
        {data.roleContext.trim() !== "" ? (
          <Section label="Role and context">{data.roleContext}</Section>
        ) : null}
        {(["functionalJobs", "emotionalJobs", "socialJobs"] as const).map(
          (key) => (
            <Section
              key={key}
              label={
                key === "functionalJobs"
                  ? "Functional jobs"
                  : key === "emotionalJobs"
                    ? "Emotional jobs"
                    : "Social jobs"
              }
            >
              <TextList items={data[key]} />
            </Section>
          ),
        )}
        {data.outcomes.some((o) => o.description.trim() !== "") ? (
          <Section label="Desired outcomes">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-2/3">Outcome</TableHead>
                  <TableHead className="text-right">Satisfaction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.outcomes
                  .filter((o) => o.description.trim() !== "")
                  .map((outcome, index) => (
                    <TableRow key={index}>
                      <TableCell>{outcome.description}</TableCell>
                      <TableCell className="text-right">
                        <ScoreCell
                          value={outcome.satisfaction}
                          label="Satisfaction"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Section>
        ) : null}
      </div>
    );
  }

  if (phaseType === PhaseType.PainGain) {
    const data = normalizePainGainOutput(output);
    if (JSON.stringify(data) === JSON.stringify(PAIN_GAIN_DEFAULTS)) {
      return <p className="text-body text-on-surface-variant">No content yet.</p>;
    }
    return (
      <div className="flex flex-col gap-6">
        {data.pains.length > 0 ? (
          <Section label="Pains">
            <ul className="flex flex-col gap-3">
              {data.pains.map((pain, index) => (
                <li key={index} className="border-b border-outline-variant pb-3 last:border-b-0 last:pb-0">
                  <p>{pain.description}</p>
                  <p className="mt-1 text-body-sm tabular-nums text-on-surface-variant">
                    Severity {pain.severity} / 5 · Frequency {pain.frequency} / 5
                    · Business impact {pain.businessImpact} / 5 · Score{" "}
                    {painCombinedScore(pain)}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {data.gains.length > 0 ? (
          <Section label="Gains">
            <ul className="flex flex-col gap-3">
              {data.gains.map((gain, index) => (
                <li key={index} className="border-b border-outline-variant pb-3 last:border-b-0 last:pb-0">
                  <p>{gain.description}</p>
                  <p className="mt-1 text-body-sm tabular-nums text-on-surface-variant">
                    Relevance {gain.relevance} / 5 · Current satisfaction{" "}
                    {gain.currentSatisfaction} / 5
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    );
  }

  if (phaseType === PhaseType.ValueProp) {
    const data = normalizeValuePropOutput(output);
    if (JSON.stringify(data) === JSON.stringify(VALUE_PROP_DEFAULTS)) {
      return <p className="text-body text-on-surface-variant">No content yet.</p>;
    }
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-h3 text-on-surface">Customer Profile</h3>
          <div className="mt-2 flex flex-col gap-3">
            <Section label="Gains">
              <TextList items={data.customerProfile.gains} />
            </Section>
            <Section label="Pains">
              <TextList items={data.customerProfile.pains} />
            </Section>
            <Section label="Jobs">
              <TextList items={data.customerProfile.jobs} />
            </Section>
          </div>
        </div>
        <div>
          <h3 className="text-h3 text-on-surface">Value Map</h3>
          <div className="mt-2 flex flex-col gap-4">
            <Section label="Gain creators">
              <TextList items={data.valueMap.gainCreators} />
            </Section>
            <Section label="Pain relievers">
              <TextList items={data.valueMap.painRelievers} />
            </Section>
            <Section label="Products and services">
              <TextList items={data.valueMap.productsAndServices} />
            </Section>
          </div>
        </div>
      </div>
    );
  }

  if (phaseType === PhaseType.BusinessModel) {
    const data = normalizeBusinessModelOutput(output);
    if (JSON.stringify(data) === JSON.stringify(BUSINESS_MODEL_DEFAULTS)) {
      return <p className="text-body text-on-surface-variant">No content yet.</p>;
    }
    const blocks = [
      ["Key Partners", data.keyPartners],
      ["Key Activities", data.keyActivities],
      ["Key Resources", data.keyResources],
      ["Value Proposition", data.valueProposition],
      ["Customer Relationships", data.customerRelationships],
      ["Channels", data.channels],
      ["Customer Segments", data.customerSegments],
      ["Revenue Streams", data.revenueStreams.text],
      ["Cost Structure", data.costStructure.text],
    ] as const;
    return (
      <div className="flex flex-col gap-6">
        {blocks.map(([label, text]) =>
          text.trim() !== "" ? (
            <Section key={label} label={label}>
              {text}
            </Section>
          ) : null,
        )}
        {data.revenueStreams.numeric !== null ? (
          <Section label="Revenue, numeric">
            <span className="tabular-nums">{data.revenueStreams.numeric}</span>
          </Section>
        ) : null}
        {data.costStructure.numeric !== null ? (
          <Section label="Cost, numeric">
            <span className="tabular-nums">{data.costStructure.numeric}</span>
          </Section>
        ) : null}
      </div>
    );
  }

  if (phaseType === PhaseType.Vision) {
    const data = normalizeVisionOutput(output);
    if (JSON.stringify(data) === JSON.stringify(VISION_DEFAULTS)) {
      return <p className="text-body text-on-surface-variant">No content yet.</p>;
    }
    return (
      <div className="flex flex-col gap-6">
        {data.productVision.trim() !== "" ? (
          <Section label="Product Vision">{data.productVision}</Section>
        ) : null}
        {data.problemStatement.trim() !== "" ? (
          <Section label="Problem Statement">{data.problemStatement}</Section>
        ) : null}
      </div>
    );
  }

  // PhaseType.BusinessCase — the terminal case (AD-5: exactly six values).
  {
    const data = normalizeBusinessCaseOutput(output);
    if (JSON.stringify(data) === JSON.stringify(BUSINESS_CASE_DEFAULTS)) {
      return (
        <p className="text-body text-on-surface-variant">No content yet.</p>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        {data.successMetrics.length > 0 ? (
          <Section label="Success metrics">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Definition</TableHead>
                  <TableHead>Baseline value</TableHead>
                  <TableHead>Target value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.successMetrics.map((metric, index) => (
                  <TableRow key={index}>
                    <TableCell>{metric.name}</TableCell>
                    <TableCell>{metric.definition}</TableCell>
                    <TableCell>{metric.baseline}</TableCell>
                    <TableCell>{metric.target}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        ) : null}
        {data.investment.effortUnit.trim() !== "" ||
        data.investment.duration.trim() !== "" ||
        data.investment.teamComposition.trim() !== "" ? (
          <Section label="Estimated investment">
            <div className="flex flex-col gap-1">
              {data.investment.effortUnit.trim() !== "" ? (
                <p>
                  <span className="text-label text-on-surface-variant">
                    Effort unit:{" "}
                  </span>
                  {data.investment.effortUnit}
                </p>
              ) : null}
              {data.investment.duration.trim() !== "" ? (
                <p>
                  <span className="text-label text-on-surface-variant">
                    Duration:{" "}
                  </span>
                  {data.investment.duration}
                </p>
              ) : null}
              {data.investment.teamComposition.trim() !== "" ? (
                <p>
                  <span className="text-label text-on-surface-variant">
                    Team composition:{" "}
                  </span>
                  {data.investment.teamComposition}
                </p>
              ) : null}
            </div>
          </Section>
        ) : null}
        {data.projectedImpact.narrative.trim() !== "" ||
        data.projectedImpact.revenue !== null ||
        data.projectedImpact.costReduction !== null ||
        data.projectedImpact.strategicValue !== null ? (
          <Section label="Projected impact">
            <div className="flex flex-col gap-1">
              {data.projectedImpact.narrative.trim() !== "" ? (
                <p>{data.projectedImpact.narrative}</p>
              ) : null}
              {(
                [
                  ["Projected revenue", data.projectedImpact.revenue],
                  ["Cost reduction", data.projectedImpact.costReduction],
                  ["Strategic value", data.projectedImpact.strategicValue],
                ] as const
              ).map(([label, value]) =>
                value !== null ? (
                  <p key={label} className="tabular-nums">
                    <span className="text-label text-on-surface-variant">
                      {label}:{" "}
                    </span>
                    {value}
                  </p>
                ) : null,
              )}
            </div>
          </Section>
        ) : null}
        {data.keyAssumptions.length > 0 ? (
          <Section label="Key assumptions">
            <ul className="flex flex-col gap-2">
              {data.keyAssumptions.map((assumption, index) => (
                <li key={index} className="flex items-center gap-3">
                  <span>{assumption.text}</span>
                  <span
                    className={`rounded-sm px-2 py-0.5 text-caption ${STATUS_SELECTED_CLASSES[assumption.status]}`}
                  >
                    {assumption.status}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    );
  }
}
