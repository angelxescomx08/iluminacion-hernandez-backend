export type ProductCharacteristics = Record<string, unknown>;

export type Product = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  content: string | null;
  characteristics: ProductCharacteristics | null;
  price: string;
  stock: number;
  isActive: boolean;
  stripeProductId: string | null;
  stripePriceId: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ProductImage = {
  id: string;
  productId: string;
  url: string;
  objectKey: string | null;
  isMain: boolean;
  sortOrder: number;
};

export type ProductWithImages = Product & { images: ProductImage[] };
