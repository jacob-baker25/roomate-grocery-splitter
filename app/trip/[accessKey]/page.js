import TripClient from "./TripClient.js";

export default async function TripPage({ params }) {
  const { accessKey } = await params;
  return <TripClient accessKey={accessKey} />;
}
