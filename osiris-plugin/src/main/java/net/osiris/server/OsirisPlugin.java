package net.osiris.server;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;

public class OsirisPlugin extends JavaPlugin implements Listener {
    private String apiUrl;
    private final Gson gson = new Gson();
    private final Map<String, List<String>> itemCommands = new HashMap<>();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        reloadConfig();
        apiUrl = getConfig().getString("api-url", "https://osiris.vercel.app");
        loadItemCommands();
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("OsirisServerPlugin enabled - API: " + apiUrl);
    }

    private void loadItemCommands() {
        itemCommands.clear();
        if (getConfig().isConfigurationSection("items")) {
            for (String key : getConfig().getConfigurationSection("items").getKeys(false)) {
                itemCommands.put(key.toLowerCase(), getConfig().getStringList("items." + key));
            }
        }
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> syncPlayer(player));
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (!cmd.getName().equalsIgnoreCase("osiris")) return false;
        if (args.length == 0) return false;

        if (args[0].equalsIgnoreCase("reload") && sender.hasPermission("osiris.admin")) {
            reloadConfig();
            loadItemCommands();
            apiUrl = getConfig().getString("api-url", "https://osiris.vercel.app");
            sender.sendMessage("§a[Osiris] Config reloaded!");
            return true;
        }

        if (args[0].equalsIgnoreCase("redeem") && sender instanceof Player player) {
            Bukkit.getScheduler().runTaskAsynchronously(this, () -> syncPlayer(player));
            sender.sendMessage("§a[Osiris] §7Checking for pending deliveries...");
            return true;
        }

        return false;
    }

    private void syncPlayer(Player player) {
        String raw = player.getUniqueId().toString().replace("-", "");
        String uuid = raw.substring(0, 8) + "-" + raw.substring(8, 12) + "-"
                + raw.substring(12, 16) + "-" + raw.substring(16, 20) + "-" + raw.substring(20);

        try {
            JsonObject syncData = callApi("GET", "/api/sync/player?uuid=" + uuid, null);
            if (syncData == null) return;

            if (!syncData.get("registered").getAsBoolean()) {
                player.sendMessage("§a[Osiris] §7Welcome! Register at osiris.vercel.app to earn gold!");
                return;
            }

            String username = syncData.get("username").getAsString();
            int gold = syncData.get("gold").getAsInt();
            player.sendMessage("§a[Osiris] §7Welcome §f" + username + "§7! Gold: §e" + gold + " ⛁");

            JsonArray deliveries = syncData.getAsJsonArray("pendingDeliveries");
            if (deliveries != null && deliveries.size() > 0) {
                for (int i = 0; i < deliveries.size(); i++) {
                    JsonObject item = deliveries.getAsJsonObject(i);
                    int id = item.get("id").getAsInt();
                    String itemName = item.get("item_name").getAsString();
                    deliverItem(player, itemName, id);
                }
            }
        } catch (Exception e) {
            getLogger().log(Level.WARNING, "Failed to sync player " + player.getName(), e);
        }
    }

    private void deliverItem(Player player, String itemName, int deliveryId) {
        List<String> commands = itemCommands.get(itemName.toLowerCase());
        if (commands != null) {
            for (String cmd : commands) {
                String finalCmd = cmd.replace("{player}", player.getName());
                Bukkit.dispatchCommand(Bukkit.getConsoleSender(), finalCmd);
            }
        } else {
            player.sendMessage("§a[Osiris] §7You received: §f" + itemName);
        }

        String uuid = player.getUniqueId().toString();
        markDelivered(uuid, deliveryId);
        player.sendMessage("§a[Osiris] §7✓ §f" + itemName + " §7delivered!");
    }

    private void markDelivered(String uuid, int deliveryId) {
        JsonObject body = new JsonObject();
        body.addProperty("uuid", uuid);
        body.addProperty("id", deliveryId);
        callApi("POST", "/api/sync/deliver", body);
    }

    private JsonObject callApi(String method, String path, JsonObject body) {
        try {
            URL url = new URI(apiUrl + path).toURL();
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(method);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            if (body != null) {
                conn.setDoOutput(true);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(gson.toJson(body).getBytes(StandardCharsets.UTF_8));
                }
            }

            int responseCode = conn.getResponseCode();
            if (responseCode == 200) {
                try (InputStreamReader reader = new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)) {
                    return gson.fromJson(reader, JsonObject.class);
                }
            }
        } catch (Exception e) {
            getLogger().log(Level.WARNING, "API call failed: " + method + " " + path, e);
        }
        return null;
    }
}
