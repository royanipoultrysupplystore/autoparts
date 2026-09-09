import type {
  BodyType,
  DrivetrainType,
  ExpenseCategory,
  FuelType,
  PartCondition,
  PaymentMethod,
  SaleChannel,
  TransmissionType,
  VehicleSource,
  VehicleStatus,
} from "@/types/db";

/**
 * Option lists for the forms.
 *
 * The make and model lists are suggestions only -- every combobox falls
 * back to free text. A rigid vehicle database would just get in the way
 * the first time a Kia Rondo or a re-badged import comes through the gate.
 */

/** Common on BC roads and at ICBC salvage. Not exhaustive, not enforced. */
export const COMMON_MAKES = [
  "Acura", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler",
  "Dodge", "Fiat", "Ford", "Genesis", "GMC", "Honda", "Hyundai", "Infiniti",
  "Jaguar", "Jeep", "Kia", "Land Rover", "Lexus", "Lincoln", "Mazda",
  "Mercedes-Benz", "Mercury", "Mini", "Mitsubishi", "Nissan", "Pontiac",
  "Porsche", "Ram", "Saab", "Saturn", "Scion", "Subaru", "Suzuki", "Toyota",
  "Volkswagen", "Volvo",
];

/** Seeds the model suggestions; anything typed is accepted. */
export const COMMON_MODELS: Record<string, string[]> = {
  Honda: ["Civic", "Accord", "CR-V", "Fit", "Odyssey", "Pilot", "HR-V", "Ridgeline", "Element"],
  Toyota: ["Corolla", "Camry", "RAV4", "Tacoma", "Tundra", "Sienna", "Highlander", "Matrix", "Yaris", "Prius"],
  Ford: ["F-150", "F-250", "Escape", "Focus", "Fusion", "Explorer", "Ranger", "Edge", "Transit"],
  Chevrolet: ["Silverado", "Cruze", "Equinox", "Malibu", "Impala", "Trax", "Traverse", "Colorado"],
  Hyundai: ["Elantra", "Sonata", "Tucson", "Santa Fe", "Accent", "Kona", "Veloster"],
  Nissan: ["Altima", "Sentra", "Rogue", "Versa", "Frontier", "Murano", "Pathfinder", "Micra"],
  Mazda: ["Mazda3", "Mazda6", "CX-5", "CX-3", "CX-9", "Tribute"],
  Kia: ["Forte", "Optima", "Sorento", "Sportage", "Soul", "Rio", "Rondo"],
  Volkswagen: ["Jetta", "Golf", "Passat", "Tiguan", "Beetle"],
  Subaru: ["Impreza", "Outback", "Forester", "Legacy", "Crosstrek", "WRX"],
  Dodge: ["Grand Caravan", "Journey", "Charger", "Dart", "Ram 1500"],
  Jeep: ["Grand Cherokee", "Cherokee", "Wrangler", "Compass", "Patriot"],
  GMC: ["Sierra", "Terrain", "Acadia", "Canyon", "Savana"],
  BMW: ["3 Series", "5 Series", "X3", "X5", "1 Series"],
  "Mercedes-Benz": ["C-Class", "E-Class", "GLK", "ML", "Sprinter"],
  Acura: ["TL", "TSX", "MDX", "RDX", "CSX", "ILX"],
  Lexus: ["ES", "IS", "RX", "GS", "NX"],
  Chrysler: ["300", "Town & Country", "Sebring", "Pacifica"],
  Mitsubishi: ["Lancer", "Outlander", "RVR", "Eclipse"],
  Ram: ["1500", "2500", "ProMaster"],
};

export const EXTERIOR_COLOURS = [
  "White", "Black", "Silver", "Grey", "Blue", "Red", "Green",
  "Brown", "Beige", "Gold", "Orange", "Yellow", "Burgundy", "Purple",
];

export const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: "sedan", label: "Sedan" },
  { value: "coupe", label: "Coupe" },
  { value: "hatchback", label: "Hatchback" },
  { value: "suv", label: "SUV" },
  { value: "truck", label: "Truck" },
  { value: "van", label: "Van" },
  { value: "wagon", label: "Wagon" },
];

export const TRANSMISSIONS: { value: TransmissionType; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

export const DRIVETRAINS: { value: DrivetrainType; label: string }[] = [
  { value: "fwd", label: "FWD" },
  { value: "rwd", label: "RWD" },
  { value: "awd", label: "AWD" },
  { value: "4wd", label: "4WD" },
];

export const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: "gas", label: "Gas" },
  { value: "diesel", label: "Diesel" },
  { value: "hybrid", label: "Hybrid" },
];

export const VEHICLE_SOURCES: { value: VehicleSource; label: string }[] = [
  { value: "icbc_auction", label: "ICBC auction" },
  { value: "private", label: "Private sale" },
  { value: "other", label: "Other" },
];

export const VEHICLE_STATUSES: { value: VehicleStatus; label: string; hint: string }[] = [
  { value: "incoming", label: "Incoming", hint: "Bought, not in the yard yet" },
  { value: "parting_out", label: "Parting out", hint: "On the lot, parts for sale" },
  { value: "depleted", label: "Depleted", hint: "Everything worth selling is gone" },
  { value: "scrapped", label: "Scrapped", hint: "Shell sold for weight" },
];

export const CONDITIONS: { value: PartCondition; label: string; hint: string }[] = [
  { value: "A", label: "A — Excellent", hint: "No marks, ready to fit" },
  { value: "B", label: "B — Good", hint: "Light wear, sells as-is" },
  { value: "C", label: "C — Usable", hint: "Works, visible wear" },
  { value: "damaged", label: "Damaged", hint: "Sell cheap or for a core" },
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "etransfer", label: "E-transfer" },
  { value: "other", label: "Other" },
];

export const SALE_CHANNELS: { value: SaleChannel; label: string }[] = [
  { value: "facebook", label: "Facebook Marketplace" },
  { value: "walk_in", label: "Walk-in" },
  { value: "phone", label: "Phone" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

export const EXPENSE_CATEGORIES: {
  value: ExpenseCategory;
  label: string;
  scope: "vehicle" | "business" | "both";
}[] = [
  { value: "towing", label: "Towing", scope: "both" },
  { value: "teardown_labour", label: "Teardown labour", scope: "both" },
  { value: "parts_cleaning", label: "Parts cleaning", scope: "both" },
  { value: "rent", label: "Rent", scope: "business" },
  { value: "utilities", label: "Utilities", scope: "business" },
  { value: "insurance", label: "Insurance", scope: "business" },
  { value: "tools", label: "Tools", scope: "business" },
  { value: "fuel", label: "Fuel", scope: "both" },
  { value: "advertising", label: "Advertising", scope: "business" },
  { value: "software", label: "Software", scope: "business" },
  { value: "misc", label: "Miscellaneous", scope: "both" },
];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> =
  Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label])) as Record<
    ExpenseCategory,
    string
  >;

export const SOURCE_LABEL: Record<VehicleSource, string> = Object.fromEntries(
  VEHICLE_SOURCES.map((s) => [s.value, s.label]),
) as Record<VehicleSource, string>;

export const CHANNEL_LABEL: Record<SaleChannel, string> = Object.fromEntries(
  SALE_CHANNELS.map((s) => [s.value, s.label]),
) as Record<SaleChannel, string>;

export const PAYMENT_LABEL: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHODS.map((s) => [s.value, s.label]),
) as Record<PaymentMethod, string>;

/** Model years worth offering, newest first. */
export function yearOptions(): number[] {
  const now = new Date().getFullYear() + 1;
  return Array.from({ length: 45 }, (_, i) => now - i);
}
