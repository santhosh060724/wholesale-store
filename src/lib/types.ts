export type Product = {
  id: string;
  code: string;
  name: string;
  cost_price: number | null;
  selling_price: number;
  created_at?: string;
};

export type BillItem = {
  product_id: string | null;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type Bill = {
  id: string;
  bill_number: string;
  customer_name: string | null;
  payment_method: string;
  bill_language: string;
  discount_type: 'percent' | 'amount';
  discount_value: number;
  subtotal: number;
  discount_amount: number;
  total: number;
  total_items: number;
  created_at: string;
};

export type SavedBillWithItems = Bill & {
  bill_items: BillItemRow[];
};

export type BillItemRow = BillItem & {
  id: string;
  bill_id: string;
};

export type Staff = {
  id: string;
  name: string;
  phone: string;
  role: string | null;
  is_active: boolean;
  created_at?: string;
};

export type AttendanceStatus = 'Present' | 'Absent' | 'Half Day' | 'Leave';

export type StaffAttendance = {
  id: string;
  staff_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  check_in_time: string | null;
  notes: string | null;
  created_at?: string;
};
