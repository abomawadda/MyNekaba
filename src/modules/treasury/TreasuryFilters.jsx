import { FilterBar, SearchInput, Select } from "../../ui/enterprise";

export default function TreasuryFilters({ searchQ, setSearchQ, filterType, setFilterType, filterState, setFilterState }) {
  return (
    <FilterBar className="flex-1">
      <SearchInput
        value={searchQ}
        onChange={setSearchQ}
        placeholder="بحث بالمستفيد أو نوع الحركة أو بند الصرف أو رقم الشيك أو المرجع البنكي"
        className="min-w-[260px] md:min-w-[420px]"
      />

      <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} inputClassName="h-9 min-w-[130px] text-xs font-semibold">
        <option value="all">كل الأنواع</option>
        <option value="aid">رعاية</option>
        <option value="budget">ميزانيات</option>
        <option value="activities">أنشطة</option>
        <option value="trip">رحلات</option>
        <option value="event">فاعليات</option>
        <option value="advance">سلفة</option>
        <option value="other">أخرى</option>
        <option value="bank_charge">خصم مباشر</option>
      </Select>

      <Select value={filterState} onChange={(e) => setFilterState(e.target.value)} inputClassName="h-9 min-w-[120px] text-xs font-semibold">
        <option value="all">كل الحالات</option>
        <option value="posted">مرحل</option>
        <option value="draft">مسودة</option>
        <option value="approved">معتمد</option>
      </Select>
    </FilterBar>
  );
}
