export default function Loading() {
  return (
    <div className="container-luxe grid gap-10 pt-12 lg:grid-cols-12" aria-busy="true" aria-label="Loading product">
      <div className="skeleton aspect-[3/4] lg:col-span-7" />
      <div className="space-y-4 lg:col-span-5">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-12 w-3/4" />
        <div className="skeleton h-6 w-20" />
        <div className="skeleton mt-8 h-14 w-full" />
      </div>
    </div>
  );
}
