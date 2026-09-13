export function extractContacts(members) {
  const phones = members.map((m) => m.phone).filter(Boolean);
  const text = phones.join(",");

  navigator.clipboard.writeText(text);

  return {
    count: phones.length,
    text,
  };
}