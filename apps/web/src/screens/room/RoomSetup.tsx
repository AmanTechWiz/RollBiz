import { MIN_PLAYERS } from "@rollbiz/shared";
import {
  BANK_INVENTORY_PRESETS,
  PRICE_MULTIPLIER_PRESETS,
  SETTINGS_LIMITS,
  STARTING_MONEY_PRESETS,
  type RoomSettingsInput,
} from "@rollbiz/engine";
import { sendReady, sendStart, sendUpdateSettings, type GameRoom, type RoomView } from "../../lib/colyseus";
import { GameButton, Panel } from "../../ui";
import { EconomyPreview } from "./EconomyPreview";
import { Chips, Field, NumberField, Toggle } from "./fields";
import { money } from "./format";

const L = SETTINGS_LIMITS;

/** Lobby: players, ready/start, the host's economy settings and a live preview. */
export function RoomSetup({ room, view }: { room: GameRoom; view: RoomView }) {
  const { settings, players } = view;
  const isHost = view.hostId === room.sessionId;
  const me = players.find((p) => p.sessionId === room.sessionId);
  const allReady = players.length >= MIN_PLAYERS && players.every((p) => p.ready);
  const set = (patch: RoomSettingsInput) => sendUpdateSettings(room, patch);

  const inventory =
    Object.values(BANK_INVENTORY_PRESETS).find((p) => p.houses === settings.houses && p.hotels === settings.hotels) ?? null;

  return (
    <>
      <Panel className="space-y-3">
        <h2 className="text-xl font-bold">Players</h2>
        <ul className="space-y-2">
          {players.map((p) => (
            <li
              key={p.sessionId}
              className={`flex items-center justify-between rounded-2xl bg-cream px-3 py-2 ${p.connected ? "" : "opacity-50"}`}
            >
              <span className="font-semibold">
                {p.name}
                {p.sessionId === room.sessionId && " (you)"}
                {p.sessionId === view.hostId && " - host"}
              </span>
              <span className={p.ready ? "font-semibold text-go-dark" : "opacity-60"}>{p.ready ? "Ready" : "Waiting"}</span>
            </li>
          ))}
        </ul>
        {players.length < MIN_PLAYERS && (
          <p className="text-center text-sm">Need at least {MIN_PLAYERS} players. Share the room code!</p>
        )}
        <GameButton variant={me?.ready ? "ghost" : "go"} className="w-full" onClick={() => sendReady(room)}>
          {me?.ready ? "Not ready" : "I'm ready!"}
        </GameButton>
        {isHost && (
          <GameButton variant="sun" className="w-full" disabled={!allReady} onClick={() => sendStart(room)}>
            Start game
          </GameButton>
        )}
        {isHost && !allReady && players.length >= MIN_PLAYERS && (
          <p className="text-center text-sm opacity-70">Everyone must be ready. Changing settings unreadies everyone.</p>
        )}
        {!isHost && <p className="text-center text-sm opacity-70">Waiting for the host to start.</p>}
      </Panel>

      <Panel className="space-y-5">
        <div>
          <h2 className="text-xl font-bold">Game settings</h2>
          {!isHost && <p className="text-sm opacity-70">Only the host can change these.</p>}
        </div>

        <Field label="Starting money">
          <Chips
            disabled={!isHost}
            value={settings.startingMoney}
            options={STARTING_MONEY_PRESETS.map((v) => ({ value: v, label: money(v) }))}
            onPick={(startingMoney) => set({ startingMoney })}
          />
          <NumberField
            label="Custom"
            value={settings.startingMoney}
            min={L.startingMoney.min}
            max={L.startingMoney.max}
            disabled={!isHost}
            onCommit={(startingMoney) => set({ startingMoney })}
          />
        </Field>

        <Field
          label="Price multiplier"
          note="Scales purchase prices, rents, building costs, mortgages, taxes and card amounts. Starting money and bank cash stay as set."
        >
          <Chips
            disabled={!isHost}
            value={settings.priceMultiplier}
            options={PRICE_MULTIPLIER_PRESETS.map((v) => ({ value: v, label: `${v}x` }))}
            onPick={(priceMultiplier) => set({ priceMultiplier })}
          />
        </Field>

        <Field label="Bank houses and hotels">
          <Chips
            disabled={!isHost}
            value={inventory ? `${inventory.houses}/${inventory.hotels}` : null}
            options={Object.values(BANK_INVENTORY_PRESETS).map((p) => ({
              value: `${p.houses}/${p.hotels}`,
              label: `${p.houses} houses, ${p.hotels} hotels`,
            }))}
            onPick={(key) => {
              const [houses, hotels] = key.split("/").map(Number);
              if (houses && hotels) set({ houses, hotels });
            }}
          />
          <NumberField
            label="Houses"
            value={settings.houses}
            min={L.houses.min}
            max={L.houses.max}
            disabled={!isHost}
            onCommit={(houses) => set({ houses })}
          />
          <NumberField
            label="Hotels"
            value={settings.hotels}
            min={L.hotels.min}
            max={L.hotels.max}
            disabled={!isHost}
            onCommit={(hotels) => set({ hotels })}
          />
        </Field>

        <Field label="Bank cash">
          <NumberField
            label="Rupees"
            value={settings.bankCash}
            min={L.bankCash.min}
            max={L.bankCash.max}
            disabled={!isHost}
            onCommit={(bankCash) => set({ bankCash })}
          />
        </Field>

        <Field label="Game mode">
          <Chips
            disabled={!isHost}
            value={settings.gameMode}
            options={[
              { value: "elimination", label: "Last one standing" },
              { value: "timed", label: "Timed" },
            ]}
            onPick={(gameMode) => set({ gameMode })}
          />
          {settings.gameMode === "timed" && (
            <NumberField
              label="Minutes"
              value={settings.durationMinutes}
              min={L.durationMinutes.min}
              max={L.durationMinutes.max}
              disabled={!isHost}
              onCommit={(durationMinutes) => set({ durationMinutes })}
            />
          )}
        </Field>

        <div className="divide-y divide-brand-ink/15">
          <Toggle
            label="Auctions"
            checked={settings.auctionsEnabled}
            disabled={!isHost}
            onChange={(auctionsEnabled) => set({ auctionsEnabled })}
          />
          <Toggle
            label="Trading"
            checked={settings.tradingEnabled}
            disabled={!isHost}
            onChange={(tradingEnabled) => set({ tradingEnabled })}
          />
          <Toggle
            label="Doubles roll again"
            checked={settings.doublesRollAgain}
            disabled={!isHost}
            onChange={(doublesRollAgain) => set({ doublesRollAgain })}
          />
          <Toggle
            label="Three doubles go to jail"
            checked={settings.threeDoublesToJail}
            disabled={!isHost}
            onChange={(threeDoublesToJail) => set({ threeDoublesToJail })}
          />
        </div>
      </Panel>

      <EconomyPreview settings={settings} />
    </>
  );
}
