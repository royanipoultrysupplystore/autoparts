"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, NativeSelect, Textarea } from "@/components/ui/field";
import { Card, SectionHeading } from "@/components/ui/primitives";
import { centsToInput, formatMoney, parseMoneyToCents } from "@/lib/money";
import { todayInVancouver } from "@/lib/format";
import {
  BODY_TYPES,
  COMMON_MAKES,
  COMMON_MODELS,
  DRIVETRAINS,
  EXTERIOR_COLOURS,
  FUEL_TYPES,
  TRANSMISSIONS,
  VEHICLE_SOURCES,
  VEHICLE_STATUSES,
  yearOptions,
} from "@/lib/vehicle-options";
import type { ActionState } from "@/lib/actions/vehicles";
import type { Vehicle, VehicleFinance } from "@/types/db";
import { VinDecodeButton } from "./vin-decode";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  vehicle?: Vehicle;
  finance?: VehicleFinance | null;
  yardMakes?: string[];
  submitLabel: string;
};

const initial: ActionState = { ok: false };

export function VehicleForm({
  action,
  vehicle,
  finance,
  yardMakes = [],
  submitLabel,
}: Props) {
  const [state, formAction] = useActionState(action, initial);

  // Costs are kept in component state so the landed-cost total can add up
  // as it is typed. They post as plain strings; the server parses cents.
  const [purchase, setPurchase] = useState(centsToInput(finance?.purchase_price_cents) || "");
  const [auctionFee, setAuctionFee] = useState(centsToInput(finance?.auction_fee_cents) || "");
  const [transport, setTransport] = useState(centsToInput(finance?.transport_cost_cents) || "");
  const [other, setOther] = useState(
    centsToInput(finance?.other_acquisition_cost_cents) || "",
  );
  const [scrap, setScrap] = useState(centsToInput(finance?.scrap_income_cents) || "");

  const [make, setMake] = useState(vehicle?.make ?? "");

  const landed = useMemo(() => {
    const sum = [purchase, auctionFee, transport, other]
      .map((v) => parseMoneyToCents(v) ?? 0)
      .reduce((a, b) => a + b, 0);
    return sum;
  }, [purchase, auctionFee, transport, other]);

  const makeSuggestions = useMemo(
    () => [...new Set([...yardMakes, ...COMMON_MAKES])].sort((a, b) => a.localeCompare(b)),
    [yardMakes],
  );

  const modelSuggestions = COMMON_MODELS[make] ?? [];
  const fieldError = (key: string) => state.fieldErrors?.[key];

  return (
    <form action={formAction} className="space-y-5 px-3 py-4">
      {vehicle && <input type="hidden" name="id" value={vehicle.id} />}

      {state.error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3">
          <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-danger" />
          <p className="text-[13.5px] leading-relaxed text-danger">{state.error}</p>
        </div>
      )}

      {/* ---------------------------------------------------- The car */}
      <section className="space-y-2">
        <SectionHeading>The car</SectionHeading>
        <Card className="space-y-4 p-4">
          <div className="flex items-end gap-2">
            <Field label="VIN" htmlFor="vin" error={fieldError("vin")} className="flex-1">
              <Input
                id="vin"
                name="vin"
                defaultValue={vehicle?.vin ?? ""}
                placeholder="Optional"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={17}
                className="font-mono tracking-wide"
                invalid={!!fieldError("vin")}
              />
            </Field>
            <VinDecodeButton />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Year" htmlFor="year" required error={fieldError("year")}>
              <NativeSelect
                id="year"
                name="year"
                defaultValue={vehicle?.year ?? new Date().getFullYear() - 8}
              >
                {yearOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field
              label="Make"
              htmlFor="make"
              required
              error={fieldError("make")}
              className="col-span-2"
            >
              <Input
                id="make"
                name="make"
                list="make-options"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="Honda"
                autoCapitalize="words"
                autoCorrect="off"
                invalid={!!fieldError("make")}
              />
              <datalist id="make-options">
                {makeSuggestions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Model" htmlFor="model" required error={fieldError("model")}>
              <Input
                id="model"
                name="model"
                list="model-options"
                defaultValue={vehicle?.model ?? ""}
                placeholder="Civic"
                autoCapitalize="words"
                autoCorrect="off"
                invalid={!!fieldError("model")}
              />
              <datalist id="model-options">
                {modelSuggestions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>

            <Field label="Trim" htmlFor="trim">
              <Input
                id="trim"
                name="trim"
                defaultValue={vehicle?.trim ?? ""}
                placeholder="LX, Sport…"
                autoCapitalize="characters"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Body" htmlFor="body_type">
              <NativeSelect id="body_type" name="body_type" defaultValue={vehicle?.body_type ?? ""}>
                <option value="">—</option>
                {BODY_TYPES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Colour" htmlFor="exterior_colour">
              <Input
                id="exterior_colour"
                name="exterior_colour"
                list="colour-options"
                defaultValue={vehicle?.exterior_colour ?? ""}
                placeholder="White"
                autoCapitalize="words"
              />
              <datalist id="colour-options">
                {EXTERIOR_COLOURS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
        </Card>
      </section>

      {/* ------------------------------------------------ Drivetrain */}
      <section className="space-y-2">
        <SectionHeading>Under the hood</SectionHeading>
        <Card className="space-y-4 p-4">
          <Field label="Engine" htmlFor="engine" hint="However you'd describe it to a buyer.">
            <Input
              id="engine"
              name="engine"
              defaultValue={vehicle?.engine ?? ""}
              placeholder="2.0L I4"
            />
          </Field>

          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Trans." htmlFor="transmission">
              <NativeSelect
                id="transmission"
                name="transmission"
                defaultValue={vehicle?.transmission ?? ""}
              >
                <option value="">—</option>
                {TRANSMISSIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Drive" htmlFor="drivetrain">
              <NativeSelect id="drivetrain" name="drivetrain" defaultValue={vehicle?.drivetrain ?? ""}>
                <option value="">—</option>
                {DRIVETRAINS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Fuel" htmlFor="fuel_type">
              <NativeSelect id="fuel_type" name="fuel_type" defaultValue={vehicle?.fuel_type ?? "gas"}>
                {FUEL_TYPES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field label="Mileage (km)" htmlFor="mileage_km" error={fieldError("mileage_km")}>
            <Input
              id="mileage_km"
              name="mileage_km"
              inputMode="numeric"
              defaultValue={vehicle?.mileage_km ?? ""}
              placeholder="148000"
              className="tnum"
              invalid={!!fieldError("mileage_km")}
            />
          </Field>
        </Card>
      </section>

      {/* ---------------------------------------------- Acquisition */}
      <section className="space-y-2">
        <SectionHeading>What it cost</SectionHeading>
        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Bought on" htmlFor="purchase_date">
              <Input
                id="purchase_date"
                name="purchase_date"
                type="date"
                defaultValue={vehicle?.purchase_date ?? todayInVancouver()}
              />
            </Field>

            <Field label="Source" htmlFor="source">
              <NativeSelect id="source" name="source" defaultValue={vehicle?.source ?? "icbc_auction"}>
                {VEHICLE_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field label="Lot number" htmlFor="lot_number">
            <Input
              id="lot_number"
              name="lot_number"
              defaultValue={vehicle?.lot_number ?? ""}
              placeholder="ICBC-44182"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Purchase price" htmlFor="purchase_price">
              <MoneyInput
                id="purchase_price"
                name="purchase_price"
                value={purchase}
                onValueChange={setPurchase}
                placeholder="0.00"
              />
            </Field>

            <Field label="Auction fee" htmlFor="auction_fee">
              <MoneyInput
                id="auction_fee"
                name="auction_fee"
                value={auctionFee}
                onValueChange={setAuctionFee}
                placeholder="0.00"
              />
            </Field>

            <Field label="Transport" htmlFor="transport_cost">
              <MoneyInput
                id="transport_cost"
                name="transport_cost"
                value={transport}
                onValueChange={setTransport}
                placeholder="0.00"
              />
            </Field>

            <Field label="Other" htmlFor="other_acquisition_cost">
              <MoneyInput
                id="other_acquisition_cost"
                name="other_acquisition_cost"
                value={other}
                onValueChange={setOther}
                placeholder="0.00"
              />
            </Field>
          </div>

          <div className="flex items-baseline justify-between rounded-lg bg-accent-soft px-3.5 py-3">
            <span className="text-[13px] font-medium text-accent">Landed cost</span>
            <span className="tnum text-[17px] font-semibold text-accent">
              {formatMoney(landed)}
            </span>
          </div>

          <Field
            label="Scrap income"
            htmlFor="scrap_income"
            hint="What the shell brought in by weight. Add it when the hulk goes."
          >
            <MoneyInput
              id="scrap_income"
              name="scrap_income"
              value={scrap}
              onValueChange={setScrap}
              placeholder="0.00"
            />
          </Field>
        </Card>
      </section>

      {/* -------------------------------------------------- Status */}
      <section className="space-y-2">
        <SectionHeading>Status</SectionHeading>
        <Card className="space-y-4 p-4">
          <Field label="Where it's at" htmlFor="status">
            <NativeSelect id="status" name="status" defaultValue={vehicle?.status ?? "parting_out"}>
              {VEHICLE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} — {s.hint}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              defaultValue={vehicle?.notes ?? ""}
              placeholder="Hit hard on the driver's front. Airbags blown. Rear half is clean."
            />
          </Field>
        </Card>
      </section>

      <SubmitBar label={submitLabel} isNew={!vehicle} />
    </form>
  );
}

function SubmitBar({ label, isNew }: { label: string; isNew: boolean }) {
  const { pending } = useFormStatus();

  return (
    <div className="space-y-2.5 pb-2">
      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? (
          <>
            <WandSparkles className="size-5 animate-pulse" />
            {isNew ? "Building the parts list…" : "Saving…"}
          </>
        ) : (
          label
        )}
      </Button>
      {isNew && (
        <p className="text-center text-[12.5px] leading-relaxed text-ink-subtle">
          Saving builds the full parts list for this car. You&apos;ll trim it
          down on the next screen.
        </p>
      )}
    </div>
  );
}
