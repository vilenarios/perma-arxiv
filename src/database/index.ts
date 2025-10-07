import sqlite3 from 'sqlite3';
import { ArxivPaper } from '../types';
import { DB_PATH } from '../config';
import logger from '../utils/logger';

export class Database {
  private db: sqlite3.Database;

  constructor(dbPath: string = DB_PATH) {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('Error opening database', { error: err });
      } else {
        logger.info('Connected to SQLite database');
      }
    });
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY,
            version INTEGER NOT NULL,
            updated TEXT NOT NULL,
            published TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT,
            authors TEXT,
            categories TEXT,
            pdf_url TEXT,
            abstract_url TEXT,
            comment TEXT,
            journal_ref TEXT,
            doi TEXT,
            downloaded BOOLEAN DEFAULT 0,
            download_path TEXT,
            download_date TEXT,
            last_checked TEXT,
            error_count INTEGER DEFAULT 0,
            last_error TEXT,
            transaction_id TEXT,
            upload_status TEXT DEFAULT 'pending',
            upload_date TEXT,
            upload_attempts INTEGER DEFAULT 0,
            upload_error TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) reject(err);
        });

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_papers_updated ON papers(updated);
        `, (err) => {
          if (err) reject(err);
        });

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_papers_downloaded ON papers(downloaded);
        `, (err) => {
          if (err) reject(err);
        });

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_papers_categories ON papers(categories);
        `, (err) => {
          if (err) reject(err);
        });

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_papers_upload_status ON papers(upload_status);
        `, (err) => {
          if (err) reject(err);
        });

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_papers_transaction_id ON papers(transaction_id);
        `, (err) => {
          if (err) reject(err);
        });

        this.db.run(`
          CREATE TABLE IF NOT EXISTS sync_status (
            id INTEGER PRIMARY KEY,
            last_sync_date TEXT,
            last_sync_category TEXT,
            total_papers INTEGER DEFAULT 0,
            downloaded_papers INTEGER DEFAULT 0,
            failed_downloads INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) reject(err);
        });

        this.db.run(`
          CREATE TABLE IF NOT EXISTS checkpoints (
            operation TEXT PRIMARY KEY,
            last_completed_category TEXT,
            last_completed_id TEXT,
            progress_data TEXT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async upsertPaper(paper: ArxivPaper): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO papers (
          id, version, updated, published, title, summary,
          authors, categories, pdf_url, abstract_url,
          comment, journal_ref, doi, last_checked, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        paper.id,
        paper.version,
        paper.updated,
        paper.published,
        paper.title,
        paper.summary,
        JSON.stringify(paper.authors),
        JSON.stringify(paper.categories),
        paper.pdfUrl,
        paper.abstractUrl,
        paper.comment,
        paper.journalRef,
        paper.doi,
        (err) => {
          if (err) {
            logger.error('Failed to upsert paper', { paperId: paper.id, error: err });
            reject(err);
          } else {
            resolve();
          }
        }
      );

      stmt.finalize();
    });
  }

  async upsertPaperBatch(papers: ArxivPaper[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION', (err) => {
          if (err) {
            reject(err);
            return;
          }
        });

        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO papers (
            id, version, updated, published, title, summary,
            authors, categories, pdf_url, abstract_url,
            comment, journal_ref, doi, last_checked, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        let hasError = false;
        let errorDetails: any = null;

        for (const paper of papers) {
          if (hasError) break;

          stmt.run(
            paper.id,
            paper.version,
            paper.updated,
            paper.published,
            paper.title,
            paper.summary,
            JSON.stringify(paper.authors),
            JSON.stringify(paper.categories),
            paper.pdfUrl,
            paper.abstractUrl,
            paper.comment,
            paper.journalRef,
            paper.doi,
            (err) => {
              if (err) {
                hasError = true;
                errorDetails = err;
                logger.error('Failed to upsert paper in batch', { paperId: paper.id, error: err });
              }
            }
          );
        }

        stmt.finalize((err) => {
          if (err || hasError) {
            this.db.run('ROLLBACK', () => {
              reject(errorDetails || err);
            });
          } else {
            this.db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                reject(commitErr);
              } else {
                resolve();
              }
            });
          }
        });
      });
    });
  }

  async getPaper(id: string): Promise<ArxivPaper | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM papers WHERE id = ?',
        [id],
        (err, row: any) => {
          if (err) {
            reject(err);
          } else if (row) {
            resolve({
              id: row.id,
              version: row.version,
              updated: row.updated,
              published: row.published,
              title: row.title,
              summary: row.summary,
              authors: JSON.parse(row.authors),
              categories: JSON.parse(row.categories),
              pdfUrl: row.pdf_url,
              abstractUrl: row.abstract_url,
              comment: row.comment,
              journalRef: row.journal_ref,
              doi: row.doi
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async markAsDownloaded(id: string, downloadPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE papers
         SET downloaded = 1, download_path = ?, download_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [downloadPath, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async markAsError(id: string, error: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE papers
         SET error_count = error_count + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [error, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUndownloadedPapers(limit: number = 100): Promise<ArxivPaper[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM papers
         WHERE downloaded = 0 AND error_count < 3
         ORDER BY updated DESC
         LIMIT ?`,
        [limit],
        (err, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            const papers = rows.map(row => ({
              id: row.id,
              version: row.version,
              updated: row.updated,
              published: row.published,
              title: row.title,
              summary: row.summary,
              authors: JSON.parse(row.authors),
              categories: JSON.parse(row.categories),
              pdfUrl: row.pdf_url,
              abstractUrl: row.abstract_url,
              comment: row.comment,
              journalRef: row.journal_ref,
              doi: row.doi
            }));
            resolve(papers);
          }
        }
      );
    });
  }

  async getLatestUpdateDate(category?: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      let query = 'SELECT MAX(updated) as latest FROM papers';
      const params: any[] = [];

      if (category) {
        query += ' WHERE categories LIKE ?';
        params.push(`%"${category}"%`);
      }

      this.db.get(query, params, (err, row: any) => {
        if (err) reject(err);
        else resolve(row?.latest || null);
      });
    });
  }

  async updateSyncStatus(category: string, totalPapers: number, downloadedPapers: number, failedDownloads: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO sync_status (
          id, last_sync_date, last_sync_category, total_papers,
          downloaded_papers, failed_downloads, updated_at
        ) VALUES (1, CURRENT_TIMESTAMP, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [category, totalPapers, downloadedPapers, failedDownloads],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getStats(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT
          COUNT(*) as total_papers,
          SUM(CASE WHEN downloaded = 1 THEN 1 ELSE 0 END) as downloaded_papers,
          SUM(CASE WHEN error_count > 0 THEN 1 ELSE 0 END) as failed_papers
         FROM papers`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async markAsUploaded(id: string, transactionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE papers
         SET transaction_id = ?, upload_status = 'completed', upload_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [transactionId, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async markUploadError(id: string, error: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE papers
         SET upload_attempts = upload_attempts + 1, upload_error = ?, upload_status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [error, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getReadyForUpload(limit: number = 10): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM papers
         WHERE downloaded = 1 AND (upload_status = 'pending' OR upload_status = 'failed')
         AND upload_attempts < 3 AND download_path IS NOT NULL
         ORDER BY published DESC
         LIMIT ?`,
        [limit],
        (err, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getUploadStats(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT
          COUNT(*) as total_downloaded,
          SUM(CASE WHEN upload_status = 'completed' THEN 1 ELSE 0 END) as uploaded,
          SUM(CASE WHEN upload_status = 'pending' THEN 1 ELSE 0 END) as pending_upload,
          SUM(CASE WHEN upload_status = 'failed' THEN 1 ELSE 0 END) as failed_upload
         FROM papers
         WHERE downloaded = 1`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async getUploadedPapers(limit: number = 1000): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, transaction_id, upload_date
         FROM papers
         WHERE upload_status = 'completed' AND transaction_id IS NOT NULL
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async saveCheckpoint(operation: string, data: {
    lastCompletedCategory?: string;
    lastCompletedId?: string;
    progressData?: any;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO checkpoints (
          operation, last_completed_category, last_completed_id, progress_data, timestamp
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          operation,
          data.lastCompletedCategory || null,
          data.lastCompletedId || null,
          data.progressData ? JSON.stringify(data.progressData) : null
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async loadCheckpoint(operation: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM checkpoints WHERE operation = ?',
        [operation],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve({
              lastCompletedCategory: row.last_completed_category,
              lastCompletedId: row.last_completed_id,
              progressData: row.progress_data ? JSON.parse(row.progress_data) : null,
              timestamp: row.timestamp
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async clearCheckpoint(operation: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM checkpoints WHERE operation = ?',
        [operation],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}