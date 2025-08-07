package main

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	_ "modernc.org/sqlite"
)

var db *sql.DB

// Structs
type User struct {
	ID       int
	Name     string
	Email    string
	Password string
}

type Listing struct {
	ID            int
	UserID        int
	Name          string
	Description   string
	PaymentPerDay int
	ImagePath     string
}

// DB Initialization
func initDB() (*sql.DB, error) {
	database, err := sql.Open("sqlite", "file:rentx.db?_pragma=foreign_keys(1)")
	if err != nil {
		log.Println("DB open error:", err)
		return nil, err
	}

	_, err = database.Exec(`
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT,
		email TEXT UNIQUE,
		password TEXT
	);
	CREATE TABLE IF NOT EXISTS listings (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		name TEXT,
		description TEXT,
		paymentPerDay INTEGER,
		imagePath TEXT,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);
	`)
	if err != nil {
		log.Println("DB table creation error:", err)
		return nil, err
	}

	log.Println("Database initialized successfully")
	return database, nil
}

// Handlers

func signupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
		return
	}
	r.ParseForm()
	name := r.FormValue("name")
	email := r.FormValue("email")
	password := r.FormValue("password")

	_, err := db.Exec(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`, name, email, password)
	if err != nil {
		log.Println("Signup error:", err)
		http.Error(w, "Signup failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	log.Println("Signup success for email:", email)
	fmt.Fprintln(w, "Signup successful")
}

func signinHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
		return
	}
	r.ParseForm()
	email := r.FormValue("email")
	password := r.FormValue("password")

	var userID int
	err := db.QueryRow(`SELECT id FROM users WHERE email = ? AND password = ?`, email, password).Scan(&userID)
	if err != nil {
		log.Println("Signin failed for:", email, "Error:", err)
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	log.Println("Signin success for email:", email)
	fmt.Fprintf(w, "Login successful. UserID: %d", userID)
}

func createListingHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
		return
	}

	err := r.ParseMultipartForm(10 << 20) // 10MB max
	if err != nil {
		log.Println("ParseMultipartForm error:", err)
		http.Error(w, "Could not parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	userIDStr := r.FormValue("user_id")
	name := r.FormValue("name")
	description := r.FormValue("description")
	paymentStr := r.FormValue("paymentPerDay")

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		log.Println("Invalid user_id:", userIDStr, "Error:", err)
		http.Error(w, "Invalid user_id", http.StatusBadRequest)
		return
	}
	payment, err := strconv.Atoi(paymentStr)
	if err != nil {
		log.Println("Invalid paymentPerDay:", paymentStr, "Error:", err)
		http.Error(w, "Invalid paymentPerDay", http.StatusBadRequest)
		return
	}

	// Handle file upload
	file, header, err := r.FormFile("image")
	if err != nil {
		log.Println("Image upload error:", err)
		http.Error(w, "Image upload error: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	os.MkdirAll("uploads", os.ModePerm)
	filename := fmt.Sprintf("uploads/%d_%s", userID, sanitizeFilename(header.Filename))
	outPath := filepath.Clean(filename)

	outFile, err := os.Create(outPath)
	if err != nil {
		log.Println("Failed to save image:", err)
		http.Error(w, "Failed to save image: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer outFile.Close()
	_, err = io.Copy(outFile, file)
	if err != nil {
		log.Println("Failed to copy image data:", err)
		http.Error(w, "Failed to save image data: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Save to DB
	_, err = db.Exec(`INSERT INTO listings (user_id, name, description, paymentPerDay, imagePath) VALUES (?, ?, ?, ?, ?)`,
		userID, name, description, payment, outPath)
	if err != nil {
		log.Println("Failed to create listing:", err)
		http.Error(w, "Failed to create listing: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("Listing created for user %d, listing name: %s\n", userID, name)
	fmt.Fprintln(w, "Listing created")
}

func getAllListingsHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`SELECT id, name, description, paymentPerDay, imagePath FROM listings`)
	if err != nil {
		log.Println("Failed to fetch listings:", err)
		http.Error(w, "Failed to fetch listings", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var l Listing
		err := rows.Scan(&l.ID, &l.Name, &l.Description, &l.PaymentPerDay, &l.ImagePath)
		if err != nil {
			log.Println("Error scanning listing:", err)
			continue
		}
		fmt.Fprintf(w, "ID: %d, Name: %s, Description: %s, Payment: %d, Image: %s\n",
			l.ID, l.Name, l.Description, l.PaymentPerDay, l.ImagePath)
	}
}

func dashboardHandler(w http.ResponseWriter, r *http.Request) {
	userIDStr := strings.TrimPrefix(r.URL.Path, "/dashboard/")
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		log.Println("Invalid userID in dashboard:", userIDStr, err)
		http.Error(w, "Invalid userID", http.StatusBadRequest)
		return
	}

	rows, err := db.Query(`SELECT id, name, description, paymentPerDay, imagePath FROM listings WHERE user_id = ?`, userID)
	if err != nil {
		log.Println("Failed to fetch user listings:", err)
		http.Error(w, "Failed to fetch user listings", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var l Listing
		err := rows.Scan(&l.ID, &l.Name, &l.Description, &l.PaymentPerDay, &l.ImagePath)
		if err != nil {
			log.Println("Error scanning dashboard listing:", err)
			continue
		}
		fmt.Fprintf(w, "ID: %d, Name: %s, Desc: %s, Payment: %d, Image: %s\n",
			l.ID, l.Name, l.Description, l.PaymentPerDay, l.ImagePath)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func sanitizeFilename(name string) string {
	return strings.ReplaceAll(filepath.Base(name), " ", "_")
}

// func main() {
// 	var err error
// 	db, err = initDB()
// 	if err != nil {
// 		log.Fatal("DB init failed:", err)
// 	}

// 	http.Handle("/api/signup", withCORS(http.HandlerFunc(signupHandler)))
// 	http.Handle("/api/signin", withCORS(http.HandlerFunc(signinHandler)))
// 	http.Handle("/api/create", withCORS(http.HandlerFunc(createListingHandler)))
// 	http.Handle("/api/listings", withCORS(http.HandlerFunc(getAllListingsHandler)))
// 	http.Handle("/api/dashboard/", withCORS(http.HandlerFunc(dashboardHandler)))

// 	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
// 		path := "./dist" + r.URL.Path
// 		_, err := os.Stat(path)
// 		if os.IsNotExist(err) {
// 			// If file not found, serve index.html for SPA routing
// 			http.ServeFile(w, r, "./dist/index.html")
// 			return
// 		} else if err != nil {
// 			http.Error(w, "Internal Server Error", 500)
// 			return
// 		}
// 		http.FileServer(http.Dir("./dist")).ServeHTTP(w, r)
// 	})

// 	// Serve uploaded images (unchanged)
// 	http.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("uploads"))))

// 	// Serve React app static files
// 	fs := http.FileServer(http.Dir("./dist"))
// 	http.Handle("/", fs)

// 	log.Println("Server running at http://localhost:8090")
// 	log.Fatal(http.ListenAndServe(":8090", nil))
// }

func main() {
	var err error
	db, err = initDB()
	if err != nil {
		log.Fatal("DB init failed:", err)
	}

	http.Handle("/api/signup", withCORS(http.HandlerFunc(signupHandler)))
	http.Handle("/api/signin", withCORS(http.HandlerFunc(signinHandler)))
	http.Handle("/api/create", withCORS(http.HandlerFunc(createListingHandler)))
	http.Handle("/api/listings", withCORS(http.HandlerFunc(getAllListingsHandler)))
	http.Handle("/api/dashboard/", withCORS(http.HandlerFunc(dashboardHandler)))

	// Serve uploaded images
	http.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("uploads"))))

	// SPA handler for React with client routing fallback
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := "./dist" + r.URL.Path
		_, err := os.Stat(path)
		if os.IsNotExist(err) {
			// If file not found, serve index.html for SPA routing
			http.ServeFile(w, r, "./dist/index.html")
			return
		} else if err != nil {
			http.Error(w, "Internal Server Error", 500)
			return
		}
		http.FileServer(http.Dir("./dist")).ServeHTTP(w, r)
	})

	log.Println("Server running at http://localhost:8090")
	log.Fatal(http.ListenAndServe(":8090", nil))
}
