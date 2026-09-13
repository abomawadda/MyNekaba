import SearchInput from "./SearchInput";
import Toolbar from "./Toolbar";

export default function SearchBar({ value, onChange, placeholder = "بحث...", children = null, className = "" }) {
  return (
    <Toolbar
      search={<SearchInput value={value} onChange={onChange} placeholder={placeholder} />}
      actions={children}
      className={className}
    />
  );
}
