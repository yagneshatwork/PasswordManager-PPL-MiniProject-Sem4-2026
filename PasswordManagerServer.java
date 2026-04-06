import com.sun.net.httpserver.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import java.io.*;
import java.nio.file.*;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

public class PasswordManagerServer {

    // ── Constants ──────────────────────────────────────────────────────────
    private static final String VAULT_FILE   = "vault.enc";
    private static final String ALGORITHM    = "AES/GCM/NoPadding";
    private static final int    GCM_TAG_BITS = 128;
    private static final int    GCM_IV_LEN   = 12;
    private static final int    SALT_LEN     = 16;
    private static final int    ITER         = 310_000;
    private static final int    KEY_BITS     = 256;
    private static final int    PORT         = 8080;

    // ── In-memory store ────────────────────────────────────────────────────
    private final Map<String, Map<String, String>> vault = new LinkedHashMap<>();
    private SecretKey secretKey;
    private byte[]    salt;
    private boolean   unlocked = false;

    // ──────────────────────────────────────────────────────────────────────
    //  MAIN
    // ──────────────────────────────────────────────────────────────────────
    public static void main(String[] args) throws Exception {
        new PasswordManagerServer().startServer();
    }

    private void startServer() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);

        // API endpoints
        server.createContext("/api/auth",        this::handleAuth);
        server.createContext("/api/credentials", this::handleCredentials);
        server.createContext("/api/generate",    this::handleGenerate);
        server.createContext("/api/save",        this::handleSave);
        server.createContext("/api/logout",      this::handleLogout);
        server.createContext("/api/status",      this::handleStatus);

        // Static file serving
        server.createContext("/", this::handleStaticFiles);

        server.setExecutor(null);
        server.start();

        System.out.println("╔══════════════════════════════════════╗");
        System.out.println("║   Password Manager Server Started    ║");
        System.out.println("║   Open: http://localhost:" + PORT + "         ║");
        System.out.println("╚══════════════════════════════════════╝");
    }

    // ──────────────────────────────────────────────────────────────────────
    //  STATIC FILE HANDLER
    // ──────────────────────────────────────────────────────────────────────
    private void handleStaticFiles(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/")) path = "/index.html";

        // Determine the directory where the server class file resides
        String basePath = System.getProperty("user.dir");
        File file = new File(basePath, path.substring(1));

        if (!file.exists() || file.isDirectory()) {
            String response = "404 Not Found";
            exchange.sendResponseHeaders(404, response.length());
            exchange.getResponseBody().write(response.getBytes());
            exchange.getResponseBody().close();
            return;
        }

        String contentType = getContentType(path);
        byte[] bytes = Files.readAllBytes(file.toPath());
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.getResponseBody().close();
    }

    private String getContentType(String path) {
        if (path.endsWith(".html")) return "text/html; charset=UTF-8";
        if (path.endsWith(".css"))  return "text/css; charset=UTF-8";
        if (path.endsWith(".js"))   return "application/javascript; charset=UTF-8";
        if (path.endsWith(".png"))  return "image/png";
        if (path.endsWith(".jpg"))  return "image/jpeg";
        if (path.endsWith(".svg"))  return "image/svg+xml";
        if (path.endsWith(".ico"))  return "image/x-icon";
        return "application/octet-stream";
    }

    // ──────────────────────────────────────────────────────────────────────
    //  API: STATUS
    // ──────────────────────────────────────────────────────────────────────
    private void handleStatus(HttpExchange exchange) throws IOException {
        setCorsHeaders(exchange);
        if (exchange.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
            exchange.sendResponseHeaders(204, -1); return;
        }

        boolean vaultExists = Files.exists(Path.of(VAULT_FILE));
        String json = "{\"unlocked\":" + unlocked + ",\"vaultExists\":" + vaultExists + "}";
        sendJson(exchange, 200, json);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  API: AUTHENTICATE
    // ──────────────────────────────────────────────────────────────────────
    private void handleAuth(HttpExchange exchange) throws IOException {
        setCorsHeaders(exchange);
        if (exchange.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
            exchange.sendResponseHeaders(204, -1); return;
        }

        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String masterPassword = extractJsonValue(body, "masterPassword");

        if (masterPassword == null || masterPassword.isEmpty()) {
            sendJson(exchange, 400, "{\"error\":\"Master password is required\"}");
            return;
        }

        boolean vaultExists = Files.exists(Path.of(VAULT_FILE));

        if (vaultExists) {
            try {
                loadVault(masterPassword);
                unlocked = true;
                sendJson(exchange, 200, "{\"success\":true,\"message\":\"Vault unlocked\",\"entries\":" + vault.size() + ",\"isNew\":false}");
            } catch (Exception e) {
                sendJson(exchange, 401, "{\"error\":\"Wrong password or corrupted vault\"}");
            }
        } else {
            salt = generateSalt();
            secretKey = deriveKey(masterPassword, salt);
            unlocked = true;
            sendJson(exchange, 200, "{\"success\":true,\"message\":\"New vault created\",\"entries\":0,\"isNew\":true}");
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  API: CREDENTIALS (GET / POST / DELETE)
    // ──────────────────────────────────────────────────────────────────────
    private void handleCredentials(HttpExchange exchange) throws IOException {
        setCorsHeaders(exchange);
        if (exchange.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
            exchange.sendResponseHeaders(204, -1); return;
        }

        if (!unlocked) {
            sendJson(exchange, 403, "{\"error\":\"Vault is locked\"}");
            return;
        }

        switch (exchange.getRequestMethod().toUpperCase()) {
            case "GET"    -> handleGetCredentials(exchange);
            case "POST"   -> handleAddCredential(exchange);
            case "DELETE" -> handleDeleteCredential(exchange);
            default       -> sendJson(exchange, 405, "{\"error\":\"Method not allowed\"}");
        }
    }

    private void handleGetCredentials(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String search = null;
        if (query != null) {
            for (String param : query.split("&")) {
                String[] kv = param.split("=", 2);
                if (kv[0].equals("search") && kv.length == 2) {
                    search = URLDecoder.decode(kv[1], StandardCharsets.UTF_8).toLowerCase();
                }
            }
        }

        StringBuilder json = new StringBuilder("[");
        boolean first = true;
        for (var entry : vault.entrySet()) {
            if (search != null && !entry.getKey().contains(search)) continue;
            if (!first) json.append(",");
            first = false;
            json.append("{\"site\":\"").append(escapeJson(entry.getKey())).append("\"")
                .append(",\"username\":\"").append(escapeJson(entry.getValue().get("username"))).append("\"")
                .append(",\"password\":\"").append(escapeJson(entry.getValue().get("password"))).append("\"}");
        }
        json.append("]");
        sendJson(exchange, 200, json.toString());
    }

    private void handleAddCredential(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String site     = extractJsonValue(body, "site");
        String username = extractJsonValue(body, "username");
        String password = extractJsonValue(body, "password");

        if (site == null || site.isEmpty()) {
            sendJson(exchange, 400, "{\"error\":\"Site name is required\"}");
            return;
        }

        site = site.toLowerCase().trim();

        Map<String, String> entry = new HashMap<>();
        entry.put("username", username != null ? username : "");
        entry.put("password", password != null ? password : "");
        vault.put(site, entry);

        // Auto-save after adding
        saveVault();

        sendJson(exchange, 200, "{\"success\":true,\"message\":\"Credential saved\"}");
    }

    private void handleDeleteCredential(HttpExchange exchange) throws IOException {
        String query = exchange.getRequestURI().getQuery();
        String site = null;
        if (query != null) {
            for (String param : query.split("&")) {
                String[] kv = param.split("=", 2);
                if (kv[0].equals("site") && kv.length == 2) {
                    site = URLDecoder.decode(kv[1], StandardCharsets.UTF_8).toLowerCase();
                }
            }
        }

        if (site == null || !vault.containsKey(site)) {
            sendJson(exchange, 404, "{\"error\":\"Site not found\"}");
            return;
        }

        vault.remove(site);
        saveVault();
        sendJson(exchange, 200, "{\"success\":true,\"message\":\"Credential deleted\"}");
    }

    // ──────────────────────────────────────────────────────────────────────
    //  API: GENERATE PASSWORD
    // ──────────────────────────────────────────────────────────────────────
    private void handleGenerate(HttpExchange exchange) throws IOException {
        setCorsHeaders(exchange);
        if (exchange.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
            exchange.sendResponseHeaders(204, -1); return;
        }

        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        int length      = extractJsonInt(body, "length", 20);
        boolean upper   = extractJsonBool(body, "uppercase", true);
        boolean digits  = extractJsonBool(body, "digits", true);
        boolean symbols = extractJsonBool(body, "symbols", true);

        String password = buildPassword(length, upper, digits, symbols);
        sendJson(exchange, 200, "{\"password\":\"" + escapeJson(password) + "\"}");
    }

    // ──────────────────────────────────────────────────────────────────────
    //  API: SAVE VAULT
    // ──────────────────────────────────────────────────────────────────────
    private void handleSave(HttpExchange exchange) throws IOException {
        setCorsHeaders(exchange);
        if (exchange.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
            exchange.sendResponseHeaders(204, -1); return;
        }

        if (!unlocked) {
            sendJson(exchange, 403, "{\"error\":\"Vault is locked\"}");
            return;
        }

        saveVault();
        sendJson(exchange, 200, "{\"success\":true,\"message\":\"Vault saved\"}");
    }

    // ──────────────────────────────────────────────────────────────────────
    //  API: LOGOUT
    // ──────────────────────────────────────────────────────────────────────
    private void handleLogout(HttpExchange exchange) throws IOException {
        setCorsHeaders(exchange);
        if (exchange.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
            exchange.sendResponseHeaders(204, -1); return;
        }

        if (unlocked) {
            saveVault();
        }
        vault.clear();
        secretKey = null;
        salt = null;
        unlocked = false;
        sendJson(exchange, 200, "{\"success\":true,\"message\":\"Logged out\"}");
    }

    // ──────────────────────────────────────────────────────────────────────
    //  PASSWORD GENERATION
    // ──────────────────────────────────────────────────────────────────────
    private String buildPassword(int length, boolean upper, boolean digits, boolean symbols) {
        String lower   = "abcdefghijklmnopqrstuvwxyz";
        String uppers  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        String nums    = "0123456789";
        String syms    = "!@#$%^&*()_+-=[]{}|;:,.<>?";

        StringBuilder pool = new StringBuilder(lower);
        StringBuilder pw   = new StringBuilder();
        SecureRandom  rng  = new SecureRandom();

        pw.append(lower.charAt(rng.nextInt(lower.length())));
        if (upper)   { pool.append(uppers);  pw.append(uppers.charAt(rng.nextInt(uppers.length()))); }
        if (digits)  { pool.append(nums);    pw.append(nums.charAt(rng.nextInt(nums.length())));     }
        if (symbols) { pool.append(syms);    pw.append(syms.charAt(rng.nextInt(syms.length())));    }

        for (int i = pw.length(); i < length; i++)
            pw.append(pool.charAt(rng.nextInt(pool.length())));

        List<Character> chars = new ArrayList<>();
        for (char c : pw.toString().toCharArray()) chars.add(c);
        Collections.shuffle(chars, rng);
        StringBuilder result = new StringBuilder();
        for (char c : chars) result.append(c);
        return result.toString();
    }

    // ──────────────────────────────────────────────────────────────────────
    //  ENCRYPTION — SAVE
    // ──────────────────────────────────────────────────────────────────────
    private void saveVault() {
        try {
            StringBuilder sb = new StringBuilder();
            for (var entry : vault.entrySet()) {
                sb.append(entry.getKey()).append("|")
                  .append(entry.getValue().get("username")).append("|")
                  .append(entry.getValue().get("password")).append("\n");
            }

            byte[] plaintext = sb.toString().getBytes(StandardCharsets.UTF_8);
            byte[] iv        = new byte[GCM_IV_LEN];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext);

            try (FileOutputStream fos = new FileOutputStream(VAULT_FILE)) {
                fos.write(salt);
                fos.write(iv);
                fos.write(ciphertext);
            }
        } catch (Exception e) {
            System.out.println("✘ Error saving vault: " + e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  ENCRYPTION — LOAD
    // ──────────────────────────────────────────────────────────────────────
    private void loadVault(String masterPassword) throws Exception {
        byte[] fileBytes = Files.readAllBytes(Path.of(VAULT_FILE));

        salt       = Arrays.copyOfRange(fileBytes, 0, SALT_LEN);
        byte[] iv  = Arrays.copyOfRange(fileBytes, SALT_LEN, SALT_LEN + GCM_IV_LEN);
        byte[] ct  = Arrays.copyOfRange(fileBytes, SALT_LEN + GCM_IV_LEN, fileBytes.length);

        secretKey  = deriveKey(masterPassword, salt);

        Cipher cipher = Cipher.getInstance(ALGORITHM);
        cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] plaintext = cipher.doFinal(ct);

        vault.clear();
        String[] lines = new String(plaintext, StandardCharsets.UTF_8).split("\n");
        for (String line : lines) {
            if (line.isBlank()) continue;
            String[] parts = line.split("\\|", 3);
            if (parts.length == 3) {
                Map<String, String> entry = new HashMap<>();
                entry.put("username", parts[1]);
                entry.put("password", parts[2]);
                vault.put(parts[0], entry);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  KEY DERIVATION (PBKDF2 + SHA-256)
    // ──────────────────────────────────────────────────────────────────────
    private SecretKey deriveKey(String password, byte[] salt) {
        try {
            SecretKeyFactory skf = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            KeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITER, KEY_BITS);
            byte[] keyBytes = skf.generateSecret(spec).getEncoded();
            return new SecretKeySpec(keyBytes, "AES");
        } catch (Exception e) {
            throw new RuntimeException("Key derivation failed", e);
        }
    }

    private byte[] generateSalt() {
        byte[] s = new byte[SALT_LEN];
        new SecureRandom().nextBytes(s);
        return s;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  JSON HELPERS (no external libs)
    // ──────────────────────────────────────────────────────────────────────
    private void sendJson(HttpExchange exchange, int code, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.sendResponseHeaders(code, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.getResponseBody().close();
    }

    private void setCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
    }

    private String extractJsonValue(String json, String key) {
        String search = "\"" + key + "\"";
        int idx = json.indexOf(search);
        if (idx == -1) return null;
        int colon = json.indexOf(":", idx + search.length());
        if (colon == -1) return null;

        // Skip whitespace
        int start = colon + 1;
        while (start < json.length() && json.charAt(start) == ' ') start++;
        if (start >= json.length()) return null;

        if (json.charAt(start) == '"') {
            int end = json.indexOf('"', start + 1);
            if (end == -1) return null;
            return json.substring(start + 1, end).replace("\\\"", "\"").replace("\\\\", "\\");
        } else {
            int end = start;
            while (end < json.length() && json.charAt(end) != ',' && json.charAt(end) != '}') end++;
            return json.substring(start, end).trim();
        }
    }

    private int extractJsonInt(String json, String key, int defaultVal) {
        String val = extractJsonValue(json, key);
        if (val == null) return defaultVal;
        try { return Integer.parseInt(val); } catch (NumberFormatException e) { return defaultVal; }
    }

    private boolean extractJsonBool(String json, String key, boolean defaultVal) {
        String val = extractJsonValue(json, key);
        if (val == null) return defaultVal;
        return val.equalsIgnoreCase("true");
    }

    private String escapeJson(String s) {
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
