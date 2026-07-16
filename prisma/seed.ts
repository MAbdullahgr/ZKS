// prisma/seed.ts
//
// Seeds the database with a rich test dataset for a fresh install.
// Multi-store architecture: Main Store + Store B + Store C + Store D.
// All seeded data uses upsert to be idempotent — running `bun run db:seed`
// multiple times is safe (no duplicates created).
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";

// ─── Pakistani seed data ────────────────────────────────────────────────

const STORES = [
  { id: "main-store", name: "Main Store", type: "retail" as const },
  { id: "store-b", name: "Store B (Gulberg)", type: "retail" as const },
  { id: "store-c", name: "Store C (DHA)", type: "retail" as const },
  { id: "store-d", name: "Store D (Warehouse)", type: "warehouse" as const },
];

const CATEGORIES = [
  "General",
  "Beverages",
  "Snacks",
  "Groceries",
  "Household",
  "Personal Care",
  "Bakery",
];

const BRANDS = [
  "Coca-Cola",
  "PepsiCo",
  "Lays",
  "Dalda",
  "Nestlé",
  "National Foods",
  "Unilever",
  "English Biscuit",
  "Mitchell's",
  "Tapal",
];

const SUPPLIERS = [
  {
    name: "Pak Beverages Distributors",
    contactPerson: "Imran Aslam",
    phone: "0300-1234567",
    address: "Wholesale Market, Karimabad, Karachi",
  },
  {
    name: "Snack Supply Co.",
    contactPerson: "Saima Riaz",
    phone: "0301-2345678",
    address: "Empress Market, Saddar, Karachi",
  },
  {
    name: "Dalda Foods Pakistan",
    contactPerson: "Tariq Mehmood",
    phone: "0302-3456789",
    address: "SITE Industrial Area, Karachi",
  },
  {
    name: "National Foods Ltd.",
    contactPerson: "Farah Ahmed",
    phone: "0303-4567890",
    address: "Korangi Industrial Zone, Karachi",
  },
  {
    name: "Unilever Pakistan",
    contactPerson: "Bilal Khan",
    phone: "0304-5678901",
    address: "Blue Area, Islamabad",
  },
  {
    name: "Nestlé Pakistan",
    contactPerson: "Ayesha Siddiqui",
    phone: "0305-6789012",
    address: "Lahore Cantt, Lahore",
  },
  {
    name: "English Biscuit Mfrs.",
    contactPerson: "Kamran Akhtar",
    phone: "0306-7890123",
    address: "Hub Industrial Estate, Balochistan",
  },
  {
    name: "Mitchell's Fruit Farms",
    contactPerson: "Nadia Hussain",
    phone: "0307-8901234",
    address: "Rawat, Islamabad",
  },
  {
    name: "Tapal Tea Pvt. Ltd.",
    contactPerson: "Hamza Sheikh",
    phone: "0308-9012345",
    address: "Korangi, Karachi",
  },
  {
    name: "Household Essentials Co.",
    contactPerson: "Zainab Fatima",
    phone: "0309-0123456",
    address: "Shah Alam Market, Lahore",
  },
];

interface SeedProduct {
  name: string;
  category: string;
  brand: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minStock: number;
  unit: string;
}

const PRODUCTS: SeedProduct[] = [
  {
    name: "Coca Cola 1.5L",
    category: "Beverages",
    brand: "Coca-Cola",
    barcode: "5449000000996",
    costPrice: 130,
    sellingPrice: 180,
    stock: 120,
    minStock: 24,
    unit: "bottle",
  },
  {
    name: "Coca Cola 500ml",
    category: "Beverages",
    brand: "Coca-Cola",
    barcode: "5449000000286",
    costPrice: 50,
    sellingPrice: 80,
    stock: 240,
    minStock: 48,
    unit: "bottle",
  },
  {
    name: "Sprite 1.5L",
    category: "Beverages",
    brand: "Coca-Cola",
    barcode: "5449000000552",
    costPrice: 130,
    sellingPrice: 180,
    stock: 90,
    minStock: 24,
    unit: "bottle",
  },
  {
    name: "Fanta 1.5L",
    category: "Beverages",
    brand: "Coca-Cola",
    barcode: "5449000000774",
    costPrice: 130,
    sellingPrice: 180,
    stock: 75,
    minStock: 24,
    unit: "bottle",
  },
  {
    name: "Pepsi 1.5L",
    category: "Beverages",
    brand: "PepsiCo",
    barcode: "4067800044511",
    costPrice: 130,
    sellingPrice: 180,
    stock: 110,
    minStock: 24,
    unit: "bottle",
  },
  {
    name: "Mountain Dew 500ml",
    category: "Beverages",
    brand: "PepsiCo",
    barcode: "4067800013458",
    costPrice: 50,
    sellingPrice: 80,
    stock: 200,
    minStock: 48,
    unit: "bottle",
  },
  {
    name: "Nestlé Pure Life 1.5L",
    category: "Beverages",
    brand: "Nestlé",
    barcode: "6001067030018",
    costPrice: 70,
    sellingPrice: 110,
    stock: 180,
    minStock: 48,
    unit: "bottle",
  },
  {
    name: "Tapal Danedar 950g",
    category: "Beverages",
    brand: "Tapal",
    barcode: "8964000000014",
    costPrice: 850,
    sellingPrice: 1100,
    stock: 40,
    minStock: 10,
    unit: "pack",
  },
  {
    name: "Lipton Yellow Label 475g",
    category: "Beverages",
    brand: "Unilever",
    barcode: "6001087301020",
    costPrice: 780,
    sellingPrice: 1050,
    stock: 35,
    minStock: 10,
    unit: "pack",
  },
  {
    name: "Nestlé Mango Juice 1L",
    category: "Beverages",
    brand: "Nestlé",
    barcode: "6001067026011",
    costPrice: 180,
    sellingPrice: 240,
    stock: 80,
    minStock: 24,
    unit: "carton",
  },
  {
    name: "Lays Salted 52g",
    category: "Snacks",
    brand: "Lays",
    barcode: "4067800000123",
    costPrice: 40,
    sellingPrice: 60,
    stock: 300,
    minStock: 60,
    unit: "pack",
  },
  {
    name: "Lays Masala 52g",
    category: "Snacks",
    brand: "Lays",
    barcode: "4067800000130",
    costPrice: 40,
    sellingPrice: 60,
    stock: 280,
    minStock: 60,
    unit: "pack",
  },
  {
    name: "Lays Wavy Mexican Chili 70g",
    category: "Snacks",
    brand: "Lays",
    barcode: "4067800000147",
    costPrice: 55,
    sellingPrice: 80,
    stock: 150,
    minStock: 30,
    unit: "pack",
  },
  {
    name: "Kurkure Masala Munch 90g",
    category: "Snacks",
    brand: "PepsiCo",
    barcode: "4067800000154",
    costPrice: 35,
    sellingPrice: 55,
    stock: 200,
    minStock: 40,
    unit: "pack",
  },
  {
    name: "Cheetos Crunchy 65g",
    category: "Snacks",
    brand: "PepsiCo",
    barcode: "4067800000161",
    costPrice: 50,
    sellingPrice: 75,
    stock: 160,
    minStock: 30,
    unit: "pack",
  },
  {
    name: "Uncle Chipper Spicy Treat 50g",
    category: "Snacks",
    brand: "PepsiCo",
    barcode: "4067800000178",
    costPrice: 35,
    sellingPrice: 55,
    stock: 140,
    minStock: 30,
    unit: "pack",
  },
  {
    name: "Pringles Original 110g",
    category: "Snacks",
    brand: "Lays",
    barcode: "4067800000185",
    costPrice: 220,
    sellingPrice: 320,
    stock: 60,
    minStock: 12,
    unit: "can",
  },
  {
    name: "Mitchell's Chocolate Chip Cookies 200g",
    category: "Snacks",
    brand: "Mitchell's",
    barcode: "8964000000021",
    costPrice: 180,
    sellingPrice: 260,
    stock: 50,
    minStock: 12,
    unit: "pack",
  },
  {
    name: "English Biscuit Ginger Nut 200g",
    category: "Snacks",
    brand: "English Biscuit",
    barcode: "8964000000038",
    costPrice: 150,
    sellingPrice: 220,
    stock: 70,
    minStock: 12,
    unit: "pack",
  },
  {
    name: "Cocomo Chocolate Roll 30g",
    category: "Snacks",
    brand: "English Biscuit",
    barcode: "8964000000045",
    costPrice: 15,
    sellingPrice: 25,
    stock: 500,
    minStock: 100,
    unit: "pack",
  },
  {
    name: "Dalda Cooking Oil 5L",
    category: "Household",
    brand: "Dalda",
    barcode: "8964000000052",
    costPrice: 2400,
    sellingPrice: 2900,
    stock: 30,
    minStock: 8,
    unit: "jug",
  },
  {
    name: "Dalda Cooking Oil 1L",
    category: "Household",
    brand: "Dalda",
    barcode: "8964000000069",
    costPrice: 520,
    sellingPrice: 620,
    stock: 80,
    minStock: 16,
    unit: "bottle",
  },
  {
    name: "Sufi Cooking Oil 5L",
    category: "Household",
    brand: "Dalda",
    barcode: "8964000000076",
    costPrice: 2300,
    sellingPrice: 2800,
    stock: 25,
    minStock: 8,
    unit: "jug",
  },
  {
    name: "National Salt 800g",
    category: "Household",
    brand: "National Foods",
    barcode: "8964000000083",
    costPrice: 65,
    sellingPrice: 95,
    stock: 100,
    minStock: 24,
    unit: "pack",
  },
  {
    name: "National Red Chili Powder 100g",
    category: "Household",
    brand: "National Foods",
    barcode: "8964000000090",
    costPrice: 110,
    sellingPrice: 160,
    stock: 90,
    minStock: 20,
    unit: "pack",
  },
  {
    name: "National Turmeric Powder 100g",
    category: "Household",
    brand: "National Foods",
    barcode: "8964000000106",
    costPrice: 105,
    sellingPrice: 155,
    stock: 85,
    minStock: 20,
    unit: "pack",
  },
  {
    name: "National Coriander Powder 100g",
    category: "Household",
    brand: "National Foods",
    barcode: "8964000000113",
    costPrice: 100,
    sellingPrice: 150,
    stock: 80,
    minStock: 20,
    unit: "pack",
  },
  {
    name: "Surf Excel 1kg",
    category: "Household",
    brand: "Unilever",
    barcode: "6001087301037",
    costPrice: 380,
    sellingPrice: 480,
    stock: 60,
    minStock: 12,
    unit: "pack",
  },
  {
    name: "Lifebuoy Soap 125g (4-pack)",
    category: "Household",
    brand: "Unilever",
    barcode: "6001087301044",
    costPrice: 280,
    sellingPrice: 360,
    stock: 70,
    minStock: 14,
    unit: "pack",
  },
  {
    name: "Domex Floor Cleaner 1L",
    category: "Household",
    brand: "Unilever",
    barcode: "6001087301051",
    costPrice: 230,
    sellingPrice: 310,
    stock: 50,
    minStock: 12,
    unit: "bottle",
  },
  {
    name: "Pepodent Toothpaste 100g",
    category: "Personal Care",
    brand: "Unilever",
    barcode: "6001087301068",
    costPrice: 110,
    sellingPrice: 160,
    stock: 120,
    minStock: 24,
    unit: "tube",
  },
  {
    name: "Signal Toothpaste 100g",
    category: "Personal Care",
    brand: "Unilever",
    barcode: "6001087301075",
    costPrice: 115,
    sellingPrice: 165,
    stock: 110,
    minStock: 24,
    unit: "tube",
  },
  {
    name: "Palmolive Shampoo 200ml",
    category: "Personal Care",
    brand: "Unilever",
    barcode: "6001087301082",
    costPrice: 240,
    sellingPrice: 320,
    stock: 80,
    minStock: 16,
    unit: "bottle",
  },
  {
    name: "Sunsilk Shampoo 170ml",
    category: "Personal Care",
    brand: "Unilever",
    barcode: "6001087301099",
    costPrice: 230,
    sellingPrice: 310,
    stock: 90,
    minStock: 16,
    unit: "bottle",
  },
  {
    name: "Dove Soap 100g",
    category: "Personal Care",
    brand: "Unilever",
    barcode: "6001087301105",
    costPrice: 95,
    sellingPrice: 140,
    stock: 150,
    minStock: 30,
    unit: "bar",
  },
  {
    name: "Lux Soap 100g",
    category: "Personal Care",
    brand: "Unilever",
    barcode: "6001087301112",
    costPrice: 75,
    sellingPrice: 110,
    stock: 180,
    minStock: 30,
    unit: "bar",
  },
  {
    name: "Head & Shoulders 175ml",
    category: "Personal Care",
    brand: "Unilever",
    barcode: "6001087301129",
    costPrice: 320,
    sellingPrice: 420,
    stock: 60,
    minStock: 12,
    unit: "bottle",
  },
  {
    name: "Pond's Face Cream 50g",
    category: "Personal Care",
    brand: "Unilever",
    barcode: "6001087301136",
    costPrice: 180,
    sellingPrice: 250,
    stock: 70,
    minStock: 14,
    unit: "jar",
  },
  {
    name: "Vaseline Intensive Care 200ml",
    category: "Personal Care",
    brand: "Unilever",
    barcode: "6001087301143",
    costPrice: 260,
    sellingPrice: 340,
    stock: 65,
    minStock: 14,
    unit: "bottle",
  },
  {
    name: "Colgate Toothbrush Soft",
    category: "Personal Care",
    brand: "Unilever",
    barcode: "6001087301150",
    costPrice: 55,
    sellingPrice: 90,
    stock: 200,
    minStock: 40,
    unit: "piece",
  },
  {
    name: "Bread Sliced Large 700g",
    category: "Bakery",
    brand: "English Biscuit",
    barcode: "8964000000120",
    costPrice: 110,
    sellingPrice: 150,
    stock: 80,
    minStock: 20,
    unit: "loaf",
  },
  {
    name: "Bread Sliced Small 400g",
    category: "Bakery",
    brand: "English Biscuit",
    barcode: "8964000000137",
    costPrice: 75,
    sellingPrice: 105,
    stock: 100,
    minStock: 24,
    unit: "loaf",
  },
  {
    name: "Bun Burger 6-pack",
    category: "Bakery",
    brand: "English Biscuit",
    barcode: "8964000000144",
    costPrice: 130,
    sellingPrice: 180,
    stock: 60,
    minStock: 12,
    unit: "pack",
  },
  {
    name: "Croissant Plain 4-pack",
    category: "Bakery",
    brand: "Mitchell's",
    barcode: "8964000000151",
    costPrice: 220,
    sellingPrice: 300,
    stock: 30,
    minStock: 8,
    unit: "pack",
  },
  {
    name: "Donut Glazed 6-pack",
    category: "Bakery",
    brand: "Mitchell's",
    barcode: "8964000000168",
    costPrice: 280,
    sellingPrice: 380,
    stock: 25,
    minStock: 6,
    unit: "pack",
  },
  {
    name: "Cup Cake Vanilla 4-pack",
    category: "Bakery",
    brand: "Mitchell's",
    barcode: "8964000000175",
    costPrice: 180,
    sellingPrice: 250,
    stock: 40,
    minStock: 10,
    unit: "pack",
  },
  {
    name: "Rusk Plain 200g",
    category: "Bakery",
    brand: "English Biscuit",
    barcode: "8964000000182",
    costPrice: 90,
    sellingPrice: 130,
    stock: 90,
    minStock: 20,
    unit: "pack",
  },
  {
    name: "Patties Chicken 4-pack",
    category: "Bakery",
    brand: "Mitchell's",
    barcode: "8964000000199",
    costPrice: 280,
    sellingPrice: 380,
    stock: 35,
    minStock: 8,
    unit: "pack",
  },
  {
    name: "Pizza Base 10-inch",
    category: "Bakery",
    brand: "Mitchell's",
    barcode: "8964000000205",
    costPrice: 120,
    sellingPrice: 180,
    stock: 50,
    minStock: 10,
    unit: "piece",
  },
  {
    name: "Cake Sponge Vanilla 500g",
    category: "Bakery",
    brand: "Mitchell's",
    barcode: "8964000000212",
    costPrice: 350,
    sellingPrice: 480,
    stock: 20,
    minStock: 6,
    unit: "pack",
  },
];

const CUSTOMERS: Array<{
  name: string;
  phone: string;
  balance: number;
  creditLimit: number;
  address?: string;
}> = [
  {
    name: "Ahmed Khan",
    phone: "0300-1111111",
    balance: 2500,
    creditLimit: 10000,
    address: "House 12, Block 5, Gulshan-e-Iqbal, Karachi",
  },
  {
    name: "Fatima Bibi",
    phone: "0300-2222222",
    balance: 0,
    creditLimit: 5000,
    address: "Flat 4B, Ayesha Apartments, Gulberg, Lahore",
  },
  {
    name: "Muhammad Ali",
    phone: "0300-3333333",
    balance: 4800,
    creditLimit: 15000,
    address: "House 88, Street 7, DHA Phase 5, Lahore",
  },
  {
    name: "Ayesha Siddiqui",
    phone: "0300-4444444",
    balance: 1200,
    creditLimit: 8000,
    address: "Apartment 3, Bahria Town, Karachi",
  },
  {
    name: "Bilal Ahmed",
    phone: "0300-5555555",
    balance: 0,
    creditLimit: 0,
    address: "Shop 14, Saddar Market, Rawalpindi",
  },
  {
    name: "Zainab Fatima",
    phone: "0300-6666666",
    balance: 3700,
    creditLimit: 12000,
    address: "House 22, F-8 Markaz, Islamabad",
  },
  {
    name: "Usman Sheikh",
    phone: "0300-7777777",
    balance: 950,
    creditLimit: 5000,
    address: "Flat 7C, Clifton Tower, Karachi",
  },
  {
    name: "Maryam Khan",
    phone: "0300-8888888",
    balance: 0,
    creditLimit: 6000,
    address: "House 5, Block C, Johar Town, Lahore",
  },
  {
    name: "Hassan Raza",
    phone: "0300-9999999",
    balance: 6200,
    creditLimit: 20000,
    address: "Plot 14, PECHS Block 2, Karachi",
  },
  {
    name: "Sana Tariq",
    phone: "0301-1111111",
    balance: 1500,
    creditLimit: 7000,
    address: "House 9, Street 12, Faisal Town, Lahore",
  },
  {
    name: "Imran Aslam",
    phone: "0301-2222222",
    balance: 0,
    creditLimit: 5000,
    address: "Office 3, I.I. Chundrigar Road, Karachi",
  },
  {
    name: "Nadia Hussain",
    phone: "0301-3333333",
    balance: 2300,
    creditLimit: 10000,
    address: "House 17, E-11/2, Islamabad",
  },
  {
    name: "Kamran Akhtar",
    phone: "0301-4444444",
    balance: 4100,
    creditLimit: 12000,
    address: "Flat 2A, Tariq Road, Karachi",
  },
  {
    name: "Saima Riaz",
    phone: "0301-5555555",
    balance: 0,
    creditLimit: 4000,
    address: "House 33, Model Town, Lahore",
  },
  {
    name: "Tariq Mehmood",
    phone: "0301-6666666",
    balance: 8800,
    creditLimit: 25000,
    address: "House 1, DHA Phase 2, Islamabad",
  },
  {
    name: "Farah Ahmed",
    phone: "0301-7777777",
    balance: 1900,
    creditLimit: 8000,
    address: "House 24, Block B, North Nazimabad, Karachi",
  },
  {
    name: "Hamza Sheikh",
    phone: "0301-8888888",
    balance: 0,
    creditLimit: 0,
    address: "Shop 8, Anarkali Bazaar, Lahore",
  },
  {
    name: "Rabia Anwar",
    phone: "0301-9999999",
    balance: 3400,
    creditLimit: 9000,
    address: "House 6, G-9/3, Islamabad",
  },
  {
    name: "Asad Javed",
    phone: "0302-1111111",
    balance: 5600,
    creditLimit: 15000,
    address: "Plot 22, Malir Halt, Karachi",
  },
  {
    name: "Hira Malik",
    phone: "0302-2222222",
    balance: 700,
    creditLimit: 5000,
    address: "House 11, Wapda Town, Lahore",
  },
];

const DEFAULT_PASSWORD = "Seed@1234";

function idFor(storeId: string, slug: string): string {
  return `${storeId}-${slug}`;
}

async function main() {
  console.log("🌱 Seeding database...");

  for (const s of STORES) {
    await prisma.store.upsert({
      where: { id: s.id },
      update: { name: s.name, type: s.type, isActive: true },
      create: { id: s.id, name: s.name, type: s.type, isActive: true },
    });
  }
  console.log(`  ✅ ${STORES.length} stores`);

  for (const s of STORES) {
    await prisma.settings.upsert({
      where: { storeId: s.id },
      update: {},
      create: {
        code: `store-${s.id}`,
        storeId: s.id,
        storeName: s.name,
        address: "",
        phone: "",
        currency: "Rs.",
        taxRate: 0,
      },
    });

    for (const name of CATEGORIES) {
      await prisma.category.upsert({
        where: { storeId_name: { storeId: s.id, name } },
        update: {},
        create: { name, storeId: s.id, isActive: true },
      });
    }
  }
  console.log(`  ✅ Settings + ${CATEGORIES.length} categories per store`);

  const defaultTaxes: Array<{
    name: string;
    rate: number;
    type: "standard" | "fixed" | "exempt" | "zero_rated";
    fbrCode: string;
    description: string;
  }> = [
    {
      name: "Standard GST 17%",
      rate: 17,
      type: "standard",
      fbrCode: "SR-17",
      description: "Standard sales tax rate (17%) — most goods",
    },
    {
      name: "Fixed Retailer 4%",
      rate: 4,
      type: "fixed",
      fbrCode: "FR-4",
      description: "Fixed tax for tier-1 retailers (4% of retail price)",
    },
    {
      name: "Exempt",
      rate: 0,
      type: "exempt",
      fbrCode: "EX",
      description: "Exempt goods (basic food items, books, etc.)",
    },
    {
      name: "Zero-Rated (Exports)",
      rate: 0,
      type: "zero_rated",
      fbrCode: "ZR",
      description: "Zero-rated for exports",
    },
  ];
  for (const s of STORES) {
    for (const tax of defaultTaxes) {
      await prisma.tax.upsert({
        where: { storeId_name: { storeId: s.id, name: tax.name } },
        update: {},
        create: { ...tax, storeId: s.id, isActive: true },
      });
    }
  }
  console.log(`  ✅ ${defaultTaxes.length} tax rates per store`);

  for (const s of STORES) {
    for (const name of BRANDS) {
      await prisma.brand.upsert({
        where: { storeId_name: { storeId: s.id, name } },
        update: {},
        create: { name, storeId: s.id, isActive: true },
      });
    }
  }
  console.log(`  ✅ ${BRANDS.length} brands per store`);

  for (const s of STORES) {
    for (let i = 0; i < SUPPLIERS.length; i++) {
      const sup = SUPPLIERS[i];
      const supplierId = idFor(s.id, `sup-${i + 1}`);
      await prisma.supplier.upsert({
        where: { id: supplierId },
        update: {
          contactPerson: sup.contactPerson,
          phone: sup.phone,
          address: sup.address,
        },
        create: {
          id: supplierId,
          storeId: s.id,
          name: sup.name,
          contactPerson: sup.contactPerson,
          phone: sup.phone,
          address: sup.address,
          isActive: true,
        },
      });
    }
  }
  console.log(`  ✅ ${SUPPLIERS.length} suppliers per store`);

  // ─── Staff accounts ─────────────────────────────────────────────────
  //
  // A+ FIX: The `update` block now includes `passwordHash` (and `isActive`).
  // Previously only `mustChangePassword: false` was in `update`, which meant
  // re-running the seed did NOT reset the password — so if a user had
  // changed their password through the UI (or had a stale hash from a
  // previous app version), `bun run db:seed` left the old hash in place
  // and login with `Seed@1234` failed with "Invalid email or password".
  //
  // Now re-seeding resets every seeded account's password back to
  // `Seed@1234` so the E2E tests (and manual login) always work.
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  // Owner — single account on Main Store
  await prisma.user.upsert({
    where: { email: "owner@zkr-seed.local" },
    update: {
      passwordHash,
      mustChangePassword: false,
      isActive: true,
    },
    create: {
      email: "owner@zkr-seed.local",
      passwordHash,
      role: "owner",
      storeId: "main-store",
      isActive: true,
      mustChangePassword: false,
    },
  });

  for (const s of STORES) {
    // Manager — one per store
    const managerEmail = `manager.${s.id}@zkr-seed.local`;
    await prisma.user.upsert({
      where: { email: managerEmail },
      update: {
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      },
      create: {
        email: managerEmail,
        passwordHash,
        role: "manager",
        storeId: s.id,
        isActive: true,
        mustChangePassword: false,
      },
    });

    // Cashiers — two per store
    for (let i = 1; i <= 2; i++) {
      const email = `cashier${i}.${s.id}@zkr-seed.local`;
      await prisma.user.upsert({
        where: { email },
        update: {
          passwordHash,
          mustChangePassword: false,
          isActive: true,
        },
        create: {
          email,
          passwordHash,
          role: "cashier",
          storeId: s.id,
          isActive: true,
          mustChangePassword: false,
        },
      });
    }

    // Warehouse — one per store
    const whEmail = `warehouse.${s.id}@zkr-seed.local`;
    await prisma.user.upsert({
      where: { email: whEmail },
      update: {
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      },
      create: {
        email: whEmail,
        passwordHash,
        role: "warehouse",
        storeId: s.id,
        isActive: true,
        mustChangePassword: false,
      },
    });
  }
  console.log(
    `  ✅ Staff: 1 owner + ${STORES.length} managers + ${STORES.length * 2} cashiers + ${STORES.length} warehouse (password reset to "${DEFAULT_PASSWORD}" on every seed run)`,
  );

  for (const s of STORES) {
    for (let i = 0; i < CUSTOMERS.length; i++) {
      const c = CUSTOMERS[i];
      const phone = `${c.phone}#${s.id}`;
      await prisma.customer.upsert({
        where: { storeId_phone: { storeId: s.id, phone } },
        update: {},
        create: {
          storeId: s.id,
          name: c.name,
          phone,
          address: c.address,
          balance: c.balance,
          creditLimit: c.creditLimit,
          isActive: true,
        },
      });
    }
  }
  console.log(`  ✅ ${CUSTOMERS.length} customers per store`);

  for (const s of STORES) {
    const categoryMap = new Map(
      (
        await prisma.category.findMany({
          where: { storeId: s.id },
          select: { id: true, name: true },
        })
      ).map((c) => [c.name, c.id]),
    );
    const brandMap = new Map(
      (
        await prisma.brand.findMany({
          where: { storeId: s.id },
          select: { id: true, name: true },
        })
      ).map((b) => [b.name, b.id]),
    );

    for (const p of PRODUCTS) {
      const slug = p.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const sku = `${s.id}-${slug}`.toUpperCase();
      const categoryId = categoryMap.get(p.category);
      const brandId = brandMap.get(p.brand);
      if (!categoryId) continue;
      await prisma.product.upsert({
        where: { storeId_sku: { storeId: s.id, sku } },
        update: {
          costPrice: p.costPrice,
          sellingPrice: p.sellingPrice,
          stockQuantity: p.stock,
          minStockLevel: p.minStock,
          barcode: p.barcode ?? null,
          brandId: brandId ?? null,
          categoryId,
          isActive: true,
        },
        create: {
          storeId: s.id,
          name: p.name,
          sku,
          barcode: p.barcode ?? null,
          categoryId,
          brandId: brandId ?? null,
          costPrice: p.costPrice,
          sellingPrice: p.sellingPrice,
          stockQuantity: p.stock,
          minStockLevel: p.minStock,
          unit: p.unit,
          isActive: true,
        },
      });
    }
  }
  console.log(`  ✅ ${PRODUCTS.length} products per store`);

  console.log("✅ Seed complete.");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Start the dev server: bun run dev");
  console.log("  2. Visit http://localhost:3000");
  console.log("  3. Login with owner@zkr-seed.local / " + DEFAULT_PASSWORD);
  console.log("  4. Set the POS PIN via Settings → Set PIN");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
