import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div className="flex flex-col items-center justify-center p-20 gap-3 text-rose-500">
        <AlertTriangle size={36} />
        <p className="font-semibold text-sm">{this.props.fallback || "حدث خطأ في تحميل هذه الوحدة"}</p>
        <p className="text-[10px] font-semibold opacity-70 max-w-md text-center">{this.state.error.message}</p>
        <button onClick={() => this.setState({ error: null })} className="px-4 py-2 bg-rose-100 text-rose-700 rounded-lg font-semibold text-xs flex items-center gap-1.5">
          <RefreshCw size={14} /> إعادة المحاولة
        </button>
      </div>
    );
    return this.props.children;
  }
}