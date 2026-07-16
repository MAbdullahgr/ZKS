import { UserRole } from "@/generated/prisma/client";

export type ModuleConfig =
  | {
      id: string;
      label: string;
      description: string;
      iconType: "image";
      iconSrc: string;
      /** Color name from the harmonious 5-color palette. */
      color: string;
      lightColor: string;
      minRole: UserRole;
      // FIX: Roles that are explicitly excluded even if they meet minRole.
      // Used to block warehouse from POS/Sales/Customers (warehouse outranks
      // cashier in the hierarchy but shouldn't operate the POS).
      excludeRoles?: UserRole[];
      href: string;
    }
  | {
      id: string;
      label: string;
      description: string;
      iconType: "phosphor";
      iconName:
        | "Truck"
        | "Tag"
        | "Gear"
        | "Lock"
        | "Users"
        | "Bookmarks"
        | "Receipt"
        | "Storefront"
        | "Percent"
        | "ScrollText"
        | "BookOpen"
        | "CurrencyDollar"
        | "ArrowsLeftRight"
        | "Package"
        | "ShoppingCart"
        | "ChartBar"
        | "UserCircle"
        | "IdentificationCard";
      weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
      /** Color name from the harmonious 5-color palette. */
      color: string;
      lightColor: string;
      minRole: UserRole;
      excludeRoles?: UserRole[];
      href: string;
    };

const ROLE_WEIGHT: Record<UserRole, number> = {
  cashier: 1,
  warehouse: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

export function hasAccess(userRole: UserRole, module: ModuleConfig): boolean {
  if (ROLE_WEIGHT[userRole] < ROLE_WEIGHT[module.minRole]) return false;
  if (module.excludeRoles?.includes(userRole)) return false;
  return true;
}

export const modules: ModuleConfig[] = [
  {
    id: "pos",
    label: "Point of Sale",
    description: "Quick sales & checkout",
    iconType: "phosphor",
    iconName: "Storefront",
    weight: "fill",
    color: "emerald",
    lightColor: "emerald",
    minRole: "cashier",
    excludeRoles: ["warehouse"],
    href: "/pos",
  },
  {
    id: "sales",
    label: "Sales History",
    description: "View past transactions",
    iconType: "phosphor",
    iconName: "Receipt",
    weight: "fill",
    color: "emerald",
    lightColor: "emerald",
    minRole: "cashier",
    excludeRoles: ["warehouse"],
    href: "/sales",
  },
  {
    id: "customers",
    label: "Customers",
    description: "Khata & contact book",
    iconType: "phosphor",
    iconName: "Users",
    weight: "fill",
    color: "teal",
    lightColor: "teal",
    minRole: "cashier",
    excludeRoles: ["warehouse"],
    href: "/customers",
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Products & stock levels",
    iconType: "phosphor",
    iconName: "Package",
    weight: "fill",
    color: "teal",
    lightColor: "teal",
    minRole: "warehouse",
    href: "/inventory",
  },
  {
    id: "purchases",
    label: "Purchases",
    description: "Orders & receiving",
    iconType: "phosphor",
    iconName: "ShoppingCart",
    weight: "fill",
    color: "amber",
    lightColor: "amber",
    minRole: "warehouse",
    href: "/purchases",
  },
  {
    id: "suppliers",
    label: "Suppliers",
    description: "Vendor management",
    iconType: "phosphor",
    iconName: "Truck",
    weight: "fill",
    color: "amber",
    lightColor: "amber",
    minRole: "warehouse",
    href: "/suppliers",
  },
  {
    id: "transfers",
    label: "Stock Transfers",
    description: "Inter-store transfers",
    iconType: "phosphor",
    iconName: "ArrowsLeftRight",
    weight: "fill",
    color: "teal",
    lightColor: "teal",
    minRole: "warehouse",
    href: "/transfers",
  },
  {
    id: "categories",
    label: "Categories",
    description: "Product groups",
    iconType: "phosphor",
    iconName: "Tag",
    weight: "fill",
    color: "rose",
    lightColor: "rose",
    minRole: "manager",
    href: "/categories",
  },
  // ─── NEW: Brands Module ───
  {
    id: "brands",
    label: "Brands",
    description: "Manage product brands",
    iconType: "phosphor",
    iconName: "Bookmarks",
    weight: "fill",
    color: "rose",
    lightColor: "rose",
    minRole: "manager",
    href: "/brands",
  },
  // ─── NEW: Expenses Module ───
  {
    id: "expenses",
    label: "Expenses",
    description: "Daily store Kharcha",
    iconType: "phosphor",
    iconName: "Receipt",
    weight: "fill",
    color: "amber",
    lightColor: "amber",
    minRole: "manager",
    href: "/expenses",
  },
  {
    id: "reports",
    label: "Reports",
    description: "Analytics & insights",
    iconType: "phosphor",
    iconName: "ChartBar",
    weight: "fill",
    color: "slate",
    lightColor: "slate",
    minRole: "manager",
    href: "/reports",
  },
  {
    id: "accounting",
    label: "Accounting",
    description: "Ledger & financial reports",
    iconType: "phosphor",
    iconName: "BookOpen",
    weight: "fill",
    color: "emerald",
    lightColor: "emerald",
    minRole: "manager",
    href: "/accounting",
  },
  {
    id: "employees",
    label: "Employees",
    description: "HR, payroll & attendance",
    iconType: "phosphor",
    iconName: "UserCircle",
    weight: "fill",
    color: "rose",
    lightColor: "rose",
    minRole: "manager",
    href: "/employees",
  },
  {
    id: "staff",
    label: "Staff",
    description: "System access & roles",
    iconType: "phosphor",
    iconName: "IdentificationCard",
    weight: "fill",
    color: "rose",
    lightColor: "rose",
    minRole: "admin",
    href: "/staff",
  },
  // ─── NEW: Taxes Module ───
  {
    id: "taxes",
    label: "Taxes",
    description: "Tax rates & FBR codes",
    iconType: "phosphor",
    iconName: "Percent",
    weight: "fill",
    color: "amber",
    lightColor: "amber",
    minRole: "manager",
    href: "/taxes",
  },
  // ─── NEW: Payroll Module ───
  {
    id: "payroll",
    label: "Payroll",
    description: "Salaries & attendance",
    iconType: "phosphor",
    iconName: "CurrencyDollar",
    weight: "fill",
    color: "emerald",
    lightColor: "emerald",
    minRole: "manager",
    href: "/payroll",
  },
  {
    id: "audit-logs",
    label: "Audit Logs",
    description: "Track all system actions",
    iconType: "phosphor",
    iconName: "ScrollText",
    weight: "fill",
    color: "slate",
    lightColor: "slate",
    minRole: "manager",
    href: "/audit-logs",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Store configuration",
    iconType: "phosphor",
    iconName: "Gear",
    weight: "fill",
    color: "slate",
    lightColor: "slate",
    minRole: "admin",
    href: "/settings",
  },
  {
    id: "stores",
    label: "Stores",
    description: "Manage locations & warehouses",
    iconType: "phosphor",
    iconName: "Storefront",
    weight: "fill",
    color: "emerald",
    lightColor: "emerald",
    minRole: "admin",
    href: "/stores",
  },
];
