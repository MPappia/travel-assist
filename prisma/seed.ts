// Données de démonstration : `npm run seed`.
// Crée (ou recrée) un voyage complet : tâches, budget, comparatif de logements et road trip.
// Aucun appel réseau : les aperçus de liens pourront être récupérés via « Rafraîchir l'aperçu ».
import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "../src/generated/prisma/client";

const DEMO_NAME = "Road trip au Portugal (démo)";

const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

/** Date calendaire (minuit UTC) à `offset` jours d'aujourd'hui. */
function day(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}

async function main() {
  await db.trip.deleteMany({ where: { name: DEMO_NAME } });

  const start = 45;
  const trip = await db.trip.create({
    data: {
      name: DEMO_NAME,
      destination: "Portugal",
      startDate: day(start),
      endDate: day(start + 8),
      travelers: 2,
      budgetCents: 280000,
      status: "PLANNING",
      notes: "Lisbonne → Porto en remontant la côte, puis la vallée du Douro.\nPrévoir le péage électronique pour la voiture de location.",
      tasks: {
        create: [
          { title: "Réserver les vols Paris → Lisbonne / Porto → Paris", category: "TRANSPORT", dueDate: day(-3), done: true },
          { title: "Réserver la voiture de location", category: "TRANSPORT", dueDate: day(-1) },
          { title: "Vérifier la validité des cartes d'identité", category: "ADMIN", dueDate: day(10) },
          { title: "Souscrire une assurance annulation", category: "ADMIN", dueDate: day(14) },
          { title: "Choisir le logement à Lisbonne", category: "ACCOMMODATION", dueDate: day(7) },
          { title: "Réserver une dégustation dans le Douro", category: "ACTIVITIES", dueDate: day(30) },
          { title: "Acheter des billets pour le palais de Pena", category: "ACTIVITIES" },
          { title: "Préparer la trousse à pharmacie", category: "PACKING", dueDate: day(start - 2) },
          { title: "Crème solaire et chapeaux", category: "PACKING", done: true },
        ],
      },
      expenses: {
        create: [
          { label: "Vols aller-retour (2 pers.)", category: "TRANSPORT", amountCents: 41800, status: "PAID" },
          { label: "Location de voiture 8 jours", category: "TRANSPORT", amountCents: 32000, status: "BOOKED" },
          { label: "Carburant et péages", category: "TRANSPORT", amountCents: 18000, status: "ESTIMATED" },
          { label: "Hôtel à Porto (2 nuits)", category: "ACCOMMODATION", amountCents: 26000, status: "BOOKED" },
          { label: "Quinta dans le Douro (2 nuits)", category: "ACCOMMODATION", amountCents: 34000, status: "ESTIMATED" },
          { label: "Restaurants", category: "FOOD", amountCents: 48000, status: "ESTIMATED" },
          { label: "Palais de Pena + Quinta da Regaleira", category: "ACTIVITIES", amountCents: 7600, status: "ESTIMATED" },
        ],
      },
    },
  });

  // Comparatif de logements à Lisbonne
  const comparison = await db.comparison.create({
    data: {
      tripId: trip.id,
      name: "Logements Lisbonne",
      expenseCategory: "ACCOMMODATION",
      criteria: {
        create: [
          { name: "Prix total du séjour", type: "NUMBER", weight: 3, direction: "LOWER_IS_BETTER", unit: "€", position: 0 },
          { name: "Note", type: "RATING", weight: 2, direction: "HIGHER_IS_BETTER", position: 1 },
          { name: "Couchages", type: "NUMBER", weight: 1, direction: "HIGHER_IS_BETTER", position: 2 },
          { name: "Distance au centre", type: "NUMBER", weight: 2, direction: "LOWER_IS_BETTER", unit: "km", position: 3 },
          { name: "Annulation gratuite", type: "BOOLEAN", weight: 1, direction: "HIGHER_IS_BETTER", position: 4 },
          { name: "Quartier", type: "TEXT", weight: 0, direction: "HIGHER_IS_BETTER", position: 5 },
        ],
      },
    },
    include: { criteria: true },
  });
  const criterion = Object.fromEntries(comparison.criteria.map((c) => [c.name, c.id]));

  const lodgings = [
    {
      title: "Appartement avec terrasse à Alfama",
      url: "https://www.airbnb.fr/rooms/000000",
      notes: "Vue sur le Tage, 3e étage sans ascenseur.",
      values: { price: 540, rating: 4, beds: 4, distance: 1.2, cancel: true, area: "Alfama" },
    },
    {
      title: "Hôtel boutique Chiado",
      url: "https://www.booking.com/hotel/pt/exemple.fr.html",
      notes: "Petit-déjeuner inclus.",
      values: { price: 610, rating: 5, beds: 2, distance: 0.3, cancel: true, area: "Chiado" },
    },
    {
      title: "Studio à Belém",
      url: "https://www.abritel.fr/location-vacances/p0000000",
      notes: "",
      values: { price: 390, rating: 3, beds: 2, distance: 6.5, cancel: false, area: "Belém" },
    },
  ];
  for (const lodging of lodgings) {
    await db.comparisonItem.create({
      data: {
        comparisonId: comparison.id,
        title: lodging.title,
        url: lodging.url,
        notes: lodging.notes,
        previewDomain: new URL(lodging.url).hostname.replace(/^www\./, ""),
        values: {
          create: [
            { criterionId: criterion["Prix total du séjour"], numberValue: lodging.values.price },
            { criterionId: criterion["Note"], numberValue: lodging.values.rating },
            { criterionId: criterion["Couchages"], numberValue: lodging.values.beds },
            { criterionId: criterion["Distance au centre"], numberValue: lodging.values.distance },
            { criterionId: criterion["Annulation gratuite"], boolValue: lodging.values.cancel },
            { criterionId: criterion["Quartier"], textValue: lodging.values.area },
          ],
        },
      },
    });
  }

  // Road trip
  const stops = [
    { name: "Lisbonne", lat: 38.7223, lng: -9.1393, date: day(start), nights: 2 },
    { name: "Sintra", lat: 38.8029, lng: -9.3817, date: null, nights: 0 },
    { name: "Óbidos", lat: 39.3606, lng: -9.1571, date: null, nights: 1 },
    { name: "Coimbra", lat: 40.2033, lng: -8.4103, date: null, nights: 1 },
    { name: "Porto", lat: 41.1579, lng: -8.6291, date: null, nights: 2 },
    { name: "Peso da Régua", lat: 41.1632, lng: -7.7889, date: null, nights: 2, notes: "Quinta à confirmer." },
  ];
  await db.route.create({
    data: {
      tripId: trip.id,
      name: "Lisbonne → Douro",
      mode: "DRIVING",
      stops: { create: stops.map((stop, position) => ({ ...stop, position })) },
    },
  });

  console.log(`Voyage de démonstration créé : « ${DEMO_NAME} » (${trip.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
