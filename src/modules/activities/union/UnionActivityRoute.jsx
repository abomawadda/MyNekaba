import React from "react";
import { useParams } from "react-router-dom";
import UnionActivityPage from "./UnionActivityPage";
import { getUnionActivityConfig } from "./activityConfig";

export default function UnionActivityRoute() {
  const { activityId } = useParams();
  const config = getUnionActivityConfig(activityId);
  if (!config) {
    return (
      <div className="p-20 flex flex-col items-center justify-center min-h-screen text-slate-400" dir="rtl">
        <h1 className="text-4xl font-black mb-2">404</h1>
        <p className="text-sm font-bold">النشاط غير موجود</p>
      </div>
    );
  }
  return <UnionActivityPage key={config.id} config={config} />;
}
