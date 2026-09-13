"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
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
  PART_OUT_ONLY_TITLES,
  TITLE_STATUSES,
  TRANSMISSIONS,
  VEHICLE_PLANS,
  VEHICLE_SOURCES,
  VEHICLE_STATUSES,
  yearOptions,
} from "@/lib/vehicle-options";
import type { ActionState } from "@/lib/actions/vehicles";
import type {
  BodyType,
  DrivetrainType,
  FuelType,
  TitleStatus,
  TransmissionType,
  Vehicle,
  VehicleFinance,
  VehiclePlan,
  VehicleSource,
  VehicleStatus,
} from "@/types/db";
import { VinDecodeButton, type DecodedVehicle } from "./vin-decode";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  vehicle?: Vehicle;
  finance?: VehicleFinance | null;
  yardMakes?: string[];
  submitLabel: string;
  /**
   * Whether to ask what the car cost. False for partners and staff: the
   * fields are absent rather than disabled, because a greyed-out money
   * box still tells you a number exists.
   */
  canPrice?: boolean;
};

const initial: ActionState = { ok: false };

export function VehicleForm({
  action,
  vehicle,
  finance,
  yardMakes = [],
  submitLabel,
  canPrice = false,
}: Props) {
  const [state, formAction] = useActionState(action, initial);
  const isNew = !vehicle;

  // Costs are held in state so the landed total can add up as it is
  // typed. They post as plain strings; the server parses the cents.
  const [purchase, setPurchase] = useState(centsToInput(finance?.purchase_price_cents) || "");
  const [auctionFee, setAuctionFee] = useState(centsToInput(finance?.auction_fee_cents) || "");
  const [transport, setTransport] = useState(centsToInput(finance?.transport_cost_cents) || "");
  const [other, setOther] = useState(centsToInput(finance?.other_acquisition_cost_cents) || "");

  const [make, setMake] = useState(vehicle?.make ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [colour, setColour] = useState(vehicle?.exterior_colour ?? "");
  const [year, setYear] = useState(String(vehicle?.year ?? new Date().getFullYear() - 8));
  const [bodyType, setBodyType] = useState<BodyType | "">(vehicle?.body_type ?? "");
  const [transmission, setTransmission] = useState<TransmissionType | "">(
    vehicle?.transmission ?? "",
  );
  const [drivetrain, setDrivetrain] = useState<DrivetrainType | "">(vehicle?.drivetrain ?? "");
  const [fuel, setFuel] = useState<FuelType>(vehicle?.fuel_type ?? "gas");
  const [source, setSource] = useState<VehicleSource>(vehicle?.source ?? "icbc_auction");
  const [titleStatus, setTitleStatus] = useState<TitleStatus>(
    vehicle?.title_status ?? "unknown",
  );
  const [chosenPlan, setChosenPlan] = useState<VehiclePlan>(vehicle?.plan ?? "part_out");
  const [chosenStatus, setChosenStatus] = useState<VehicleStatus>(
    vehicle?.status ?? "parting_out",
  );
  const [salePrice, setSalePrice] = useState(centsToInput(finance?.sale_price_cents) || "");

  // A non-repairable or written-off car can never be road-legal again in
  // BC, so "repair and sell" is not a choice that exists for it. Derived
  // from the title rather than corrected in an effect, so the select can
  // never render a value that is not in its own option list.
  const partOutOnly = PART_OUT_ONLY_TITLES.includes(titleStatus);
  const plan: VehiclePlan = partOutOnly ? "part_out" : chosenPlan;

  // Likewise the statuses: a car being fixed up is never "parting out",
  // and one being stripped is never "sold whole".
  const statusOptions = VEHICLE_STATUSES.filter((s) =>
    plan === "repair_and_sell"
      ? s.value !== "parting_out" && s.value !== "depleted"
      : s.value !== "sold",
  );
  const status: VehicleStatus = statusOptions.some((s) => s.value === chosenStatus)
    ? chosenStatus
    : plan === "repair_and_sell"
      ? "incoming"
      : "parting_out";

  const soldWhole = plan === "repair_and_sell" && status === "sold";

  const landed = useMemo(
    () =>
      [purchase, auctionFee, transport, other]
        .map((v) => parseMoneyToCents(v) ?? 0)
        .reduce((a, b) => a + b, 0),
    [purchase, auctionFee, transport, other],
  );

  const makeSuggestions = useMemo(
    () => [...new Set([...yardMakes, ...COMMON_MAKES])].sort((a, b) => a.localeCompare(b)),
    [yardMakes],
  );

  const modelSuggestions = COMMON_MODELS[make] ?? [];
  const fieldError = (key: string) => state.fieldErrors?.[key];

  /**
   * Applies what the VIN lookup found, and reports how many fields it
   * actually filled. Nothing already entered is overwritten -- a decode
   * should never quietly replace something the partner read off the car
   * itself.
   */
  function applyDecoded(d: DecodedVehicle): number {
    let filled = 0;

    const setUncontrolled = (name: string, value?: string) => {
      if (!value) return;
      const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!el || el.value.trim() !== "") return;

      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      filled += 1;
    };

    if (d.year && year !== d.year) {
      setYear(d.year);
      filled += 1;
    }
    if (d.make && make.trim() === "") {
      setMake(d.make);
      filled += 1;
    }
    if (d.bodyType && bodyType === "") {
      setBodyType(d.bodyType);
      filled += 1;
    }
    if (d.transmission && transmission === "") {
      setTransmission(d.transmission);
      filled += 1;
    }
    if (d.drivetrain && drivetrain === "") {
      setDrivetrain(d.drivetrain);
      filled += 1;
    }
    if (d.fuelType && fuel === "gas" && d.fuelType !== "gas") {
      setFuel(d.fuelType);
      filled += 1;
    }

    if (d.model && model.trim() === "") {
      setModel(d.model);
      filled += 1;
    }

    setUncontrolled("engine", d.engine);

    return filled;
  }

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
            <VinDecodeButton onDecode={applyDecoded} />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <Field label="Year" htmlFor="year" required error={fieldError("year")}>
              <SimpleSelect
                id="year"
                name="year"
                value={year}
                onValueChange={setYear}
                options={yearOptions().map((y) => ({ value: String(y), label: String(y) }))}
              />
            </Field>

            <Field
              label="Make"
              htmlFor="make"
              required
              error={fieldError("make")}
              className="col-span-2"
            >
              <Combobox
                id="make"
                name="make"
                value={make}
                onValueChange={setMake}
                options={makeSuggestions}
                placeholder="Honda"
                invalid={!!fieldError("make")}
                emptyHint="Not a make we have seen — type it anyway."
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Model" htmlFor="model" required error={fieldError("model")}>
              <Combobox
                id="model"
                name="model"
                value={model}
                onValueChange={setModel}
                options={modelSuggestions}
                placeholder="Civic"
                invalid={!!fieldError("model")}
                emptyHint={
                  make
                    ? `Not a ${make} we have seen — type it anyway.`
                    : "Type it in; the list fills once a make is chosen."
                }
              />
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
              <SimpleSelect
                id="body_type"
                name="body_type"
                value={bodyType}
                onValueChange={setBodyType}
                placeholder="—"
                options={BODY_TYPES.map((b) => ({ value: b.value, label: b.label }))}
              />
            </Field>

            <Field label="Colour" htmlFor="exterior_colour">
              <Combobox
                id="exterior_colour"
                name="exterior_colour"
                value={colour}
                onValueChange={setColour}
                options={EXTERIOR_COLOURS}
                placeholder="White"
              />
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
              <SimpleSelect
                id="transmission"
                name="transmission"
                value={transmission}
                onValueChange={setTransmission}
                placeholder="—"
                options={TRANSMISSIONS.map((t) => ({ value: t.value, label: t.label }))}
              />
            </Field>

            <Field label="Drive" htmlFor="drivetrain">
              <SimpleSelect
                id="drivetrain"
                name="drivetrain"
                value={drivetrain}
                onValueChange={setDrivetrain}
                placeholder="—"
                options={DRIVETRAINS.map((d) => ({ value: d.value, label: d.label }))}
              />
            </Field>

            <Field label="Fuel" htmlFor="fuel_type">
              <SimpleSelect
                id="fuel_type"
                name="fuel_type"
                value={fuel}
                onValueChange={setFuel}
                options={FUEL_TYPES.map((f) => ({ value: f.value, label: f.label }))}
              />
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
        <SectionHeading>{canPrice ? "What it cost" : "Where it came from"}</SectionHeading>
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
              <SimpleSelect
                id="source"
                name="source"
                value={source}
                onValueChange={setSource}
                options={VEHICLE_SOURCES.map((s) => ({ value: s.value, label: s.label }))}
              />
            </Field>
          </div>

          <Field
            label="Title"
            htmlFor="title_status"
            hint="What the paperwork says. It decides what the car is allowed to become."
          >
            <SimpleSelect
              id="title_status"
              name="title_status"
              value={titleStatus}
              onValueChange={setTitleStatus}
              options={TITLE_STATUSES.map((t) => ({
                value: t.value,
                label: t.label,
                hint: t.hint,
              }))}
            />
          </Field>

          <Field label="What we&apos;ll do with it" htmlFor="plan">
            {/*
              Posted by the hidden input, not the select. A disabled Radix
              select disables the hidden native one it submits through, and
              a disabled control is left out of the form data entirely --
              so a write-off would arrive with no plan at all.
            */}
            <input type="hidden" name="plan" value={plan} />
            <SimpleSelect
              id="plan"
              value={plan}
              onValueChange={setChosenPlan}
              disabled={partOutOnly}
              options={VEHICLE_PLANS.map((pl) => ({
                value: pl.value,
                label: pl.label,
                hint: pl.hint,
              }))}
            />
            {partOutOnly && (
              <p className="text-[12.5px] leading-relaxed text-ink-subtle">
                A {titleStatus === "write_off" ? "written-off" : "non-repairable"} car
                cannot go back on the road, so it can only be parted out.
              </p>
            )}
          </Field>

          {canPrice ? (
            <>
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

              {plan === "repair_and_sell" && (
                <p className="rounded-lg bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink-muted">
                  Repair, inspection and anything else spent fixing this car goes in
                  under <strong className="font-medium text-ink">Expenses</strong>,
                  against this vehicle. Those costs arrive over weeks, not at the
                  auction, so they are not part of the landed figure above.
                </p>
              )}
            </>
          ) : (
            <p className="rounded-lg bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink-muted">
              The owner records what this car cost. Everything else about it is
              yours to fill in.
            </p>
          )}
        </Card>
      </section>

      {/* --------------------------------------------------- Notes */}
      <section className="space-y-2">
        <SectionHeading>Notes</SectionHeading>
        <Card className="space-y-4 p-4">
          {/*
            Status is not asked when a car is added -- it is in the yard to
            be parted out, and saying so is noise. It appears here only when
            editing, which is when a car actually needs retiring.
          */}
          {!isNew && (
            <Field label="Where it&apos;s at" htmlFor="status">
              <SimpleSelect
                id="status"
                name="status"
                value={status}
                onValueChange={setChosenStatus}
                options={statusOptions.map((s) => ({
                  value: s.value,
                  label: s.label,
                  hint: s.hint,
                }))}
              />
            </Field>
          )}

          <Field label="Anything worth knowing" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              defaultValue={vehicle?.notes ?? ""}
              placeholder="Hit hard on the driver's front. Airbags blown. Rear half is clean."
            />
          </Field>
        </Card>
      </section>

      {/*
        Only ever shown on the edit screen, for a car that was bought to
        fix and sell, once it has actually sold. Asking a partner what a
        car went for while it is still on jack stands is noise.
      */}
      {!isNew && canPrice && plan === "repair_and_sell" && (
        <section className="space-y-2">
          <SectionHeading>The sale</SectionHeading>
          <Card className="space-y-4 p-4">
            {!soldWhole && (
              <p className="rounded-lg bg-surface-2 px-3.5 py-3 text-[13px] leading-relaxed text-ink-muted">
                Set <strong className="font-medium text-ink">Where it&apos;s at</strong> to
                Sold whole below once the car is gone. Fill these in now if you
                already have the numbers.
              </p>
            )}

            <Field label="Sold for" htmlFor="sale_price">
              <MoneyInput
                id="sale_price"
                name="sale_price"
                value={salePrice}
                onValueChange={setSalePrice}
                placeholder="0.00"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Sold on" htmlFor="sold_on">
                <Input
                  id="sold_on"
                  name="sold_on"
                  type="date"
                  defaultValue={vehicle?.sold_on ?? ""}
                />
              </Field>

              <Field label="Sold to" htmlFor="sold_to">
                <Input
                  id="sold_to"
                  name="sold_to"
                  defaultValue={vehicle?.sold_to ?? ""}
                  placeholder="Buyer"
                  autoCapitalize="words"
                />
              </Field>
            </div>

            {soldWhole && (
              <div className="flex items-baseline justify-between rounded-lg bg-available-soft px-3.5 py-3">
                <span className="text-[13px] font-medium text-available">
                  Sale less landed cost
                </span>
                <span className="tnum text-[17px] font-semibold text-available">
                  {formatMoney((parseMoneyToCents(salePrice) ?? 0) - landed)}
                </span>
              </div>
            )}
          </Card>
        </section>
      )}

      <SubmitBar label={submitLabel} isNew={isNew} plan={plan} />
    </form>
  );
}

function SubmitBar({
  label,
  isNew,
  plan,
}: {
  label: string;
  isNew: boolean;
  plan: VehiclePlan;
}) {
  const { pending } = useFormStatus();

  // A car being fixed up is not stripped, so no parts list is built for
  // it and there is nothing to trim afterwards.
  const buildsParts = isNew && plan === "part_out";

  return (
    <div className="space-y-2.5 pb-2">
      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? (
          <>
            <WandSparkles className="size-5 animate-pulse" />
            {buildsParts ? "Building the parts list…" : "Saving…"}
          </>
        ) : (
          label
        )}
      </Button>
      {isNew && (
        <p className="text-center text-[12.5px] leading-relaxed text-ink-subtle">
          {buildsParts ? (
            <>
              Saving builds the full parts list for this car. You&apos;ll trim it
              down on the next screen.
            </>
          ) : (
            <>
              No parts list is built for a car you&apos;re fixing up. Put repair and
              inspection costs against it under Expenses.
            </>
          )}
        </p>
      )}
    </div>
  );
}
