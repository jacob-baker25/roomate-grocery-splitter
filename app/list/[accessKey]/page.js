import TripListClient from "./TripListClient.js";

export default async function TripListPage({ params }) {
  const { accessKey } = await params;
  return <TripListClient accessKey={accessKey} />;
}
