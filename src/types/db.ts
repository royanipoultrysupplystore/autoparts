/**
 * Hand-maintained mirror of the SQL schema.
 *
 * Money is always `number` of integer CAD cents. There are no float
 * currency values anywhere in this codebase -- see `src/lib/money.ts`.
 */

export type UserRole = "owner" | "partner" | "staff";

export type BodyType = "sedan" | "coupe" | "hatchback" | "suv" | "truck" | "van" | "wagon";
export type TransmissionType = "auto" | "manual";
export type DrivetrainType = "fwd" | "rwd" | "awd" | "4wd";
export type FuelType = "gas" | "diesel" | "hybrid";
export type VehicleSource = "icbc_auction" | "private" | "other";
export type VehicleStatus = "incoming" | "parting_out" | "depleted" | "scrapped";

export type PartSide =
  | "none"
  | "left"
  | "right"
  | "front"
  | "rear"
  | "front_left"
  | "front_right"
  | "rear_left"
  | "rear_right";

export type PartCondition = "A" | "B" | "C" | "damaged";
export type PartStatus = "available" | "reserved" | "sold" | "kept" | "scrapped";

export type PaymentMethod = "cash" | "etransfer" | "other";
export type SaleChannel = "facebook" | "walk_in" | "phone" | "referral" | "other";

export type ExpenseScope = "vehicle" | "business";
export type ExpenseCategory =
  | "towing"
  | "teardown_labour"
  | "parts_cleaning"
  | "rent"
  | "utilities"
  | "insurance"
  | "tools"
  | "fuel"
  | "advertising"
  | "software"
  | "misc";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
};

/**
 * The non-financial columns of `vehicles`. These are the only ones any
 * client role can SELECT -- the cost columns are revoked at the database
 * level and reachable only through `vehicle_finance`.
 */
export type Vehicle = {
  id: string;
  stock_number: string;
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  body_type: BodyType | null;
  engine: string | null;
  transmission: TransmissionType | null;
  drivetrain: DrivetrainType | null;
  fuel_type: FuelType;
  exterior_colour: string | null;
  mileage_km: number | null;
  purchase_date: string;
  source: VehicleSource;
  lot_number: string | null;
  status: VehicleStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Returns zero rows for `staff`. Never merge this into `Vehicle` blindly. */
export type VehicleFinance = {
  vehicle_id: string;
  purchase_price_cents: number;
  auction_fee_cents: number;
  transport_cost_cents: number;
  other_acquisition_cost_cents: number;
  scrap_income_cents: number;
  landed_cost_cents: number;
};

export type PartCatalogEntry = {
  id: string;
  name: string;
  slug: string;
  category: string;
  icon_key: string;
  default_sides: PartSide[];
  is_high_value: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type Part = {
  id: string;
  vehicle_id: string;
  catalog_id: string | null;
  name: string;
  category: string;
  icon_key: string;
  side: PartSide;
  condition: PartCondition;
  status: PartStatus;
  asking_price_cents: number;
  shelf_location: string | null;
  notes: string | null;
  is_public: boolean;
  public_price_cents: number | null;
  slug: string | null;
  reserved_by: string | null;
  reserved_for_name: string | null;
  reserved_at: string | null;
  reserved_until: string | null;
  created_at: string;
  updated_at: string;
};

export type Sale = {
  id: string;
  part_id: string;
  vehicle_id: string;
  sold_by: string | null;
  sale_price_cents: number;
  sale_date: string;
  payment_method: PaymentMethod;
  buyer_name: string | null;
  buyer_contact: string | null;
  channel: SaleChannel;
  notes: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  scope: ExpenseScope;
  vehicle_id: string | null;
  category: ExpenseCategory;
  amount_cents: number;
  expense_date: string;
  paid_by: string | null;
  note: string | null;
  receipt_url: string | null;
  created_at: string;
};

export type ActivityEntry = {
  id: string;
  user_id: string | null;
  user_name: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  summary: string;
  created_at: string;
};

/** One row of the search screen. Shaped by the `search_parts` RPC. */
export type SearchResult = {
  id: string;
  name: string;
  category: string;
  icon_key: string;
  side: PartSide;
  condition: PartCondition;
  status: PartStatus;
  asking_price_cents: number;
  shelf_location: string | null;
  reserved_for_name: string | null;
  reserved_until: string | null;
  vehicle_id: string;
  stock_number: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  vin_last6: string;
  mileage_km: number | null;
  exterior_colour: string | null;
  score: number;
  total_count: number;
};

export type VehiclePnl = {
  vehicle_id: string;
  stock_number: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  status: VehicleStatus;
  purchase_date: string;
  landed_cost_cents: number;
  direct_expenses_cents: number;
  total_invested_cents: number;
  parts_revenue_cents: number;
  scrap_income_cents: number;
  gross_profit_cents: number;
  recovery_pct: number | null;
  parts_total: number;
  parts_sold: number;
  parts_remaining: number;
  pct_catalogue_moved: number;
  days_held: number;
  revenue_per_day_cents: number;
  break_even_remaining_cents: number;
};

export type MonthlyReport = {
  year: number;
  month: number;
  period_start: string;
  period_end: string;
  basis: "cash";
  revenue_cents: number;
  sales_count: number;
  vehicles_purchased_count: number;
  vehicles_landed_cost_cents: number;
  direct_vehicle_expenses_cents: number;
  overhead_expenses_cents: number;
  overhead_by_category: { category: ExpenseCategory; amount_cents: number; count: number }[];
  net_profit_cash_cents: number;
  allocated_revenue_cents: number;
  allocated_part_cost_cents: number;
  gross_profit_on_parts_sold_cents: number;
  sales_by_partner: { user_id: string | null; name: string; count: number; amount_cents: number }[];
  sales_by_channel: { channel: SaleChannel; count: number; amount_cents: number }[];
  sales_by_payment: { payment_method: PaymentMethod; count: number; amount_cents: number }[];
  best_vehicles: {
    vehicle_id: string;
    stock_number: string;
    label: string;
    recovery_pct: number | null;
    gross_profit_cents: number;
    month_revenue_cents: number;
  }[];
};

export type DashboardStats = {
  parts_available: number;
  parts_reserved: number;
  active_vehicles: number;
  week_sales_count: number;
  finance_visible: boolean;
  /** Absent entirely for staff -- not null, absent. */
  inventory_value_cents?: number;
  month_revenue_cents?: number;
  week_revenue_cents?: number;
  vehicles_below_break_even?: {
    vehicle_id: string;
    stock_number: string;
    label: string;
    recovery_pct: number | null;
    break_even_remaining_cents: number;
    days_held: number;
    parts_remaining: number;
  }[];
};

/** The shape every conditional write returns. */
export type WriteResult =
  | { ok: true; [k: string]: unknown }
  | {
      ok: false;
      reason: string;
      status?: PartStatus;
      part_name?: string;
      sold_by_name?: string;
      sold_at?: string;
      sale_price_cents?: number;
      reserved_by_name?: string;
      reserved_for_name?: string;
      reserved_until?: string;
    };

export type PublicPart = {
  id: string;
  slug: string;
  name: string;
  category: string;
  icon_key: string;
  side: PartSide;
  condition: PartCondition;
  public_price_cents: number;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  exterior_colour: string | null;
  total_count?: number;
};
