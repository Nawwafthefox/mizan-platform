import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, UploadLog } from '../../shared/models/models';

@Injectable({ providedIn: 'root' })
export class UploadService {
  constructor(private http: HttpClient) {}

  requestToken(): Observable<ApiResponse<{ uploadId: string; token: string }>> {
    return this.http.post<ApiResponse<{ uploadId: string; token: string }>>(
      `${environment.apiUrl}/upload/request-token`, null);
  }

  uploadFiles(files: File[], uploadId: string): Observable<ApiResponse<any>> {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f, f.name));
    const params = new HttpParams().set('uploadId', uploadId);
    return this.http.post<ApiResponse<any>>(`${environment.apiUrl}/upload/files`, formData, { params });
  }

  uploadTyped(files: File[], uploadId: string, type: 'branch-sales' | 'employee-sales' | 'purchases' | 'mothan', replace = true): Observable<ApiResponse<any>> {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f, f.name));
    const params = new HttpParams().set('uploadId', uploadId).set('replace', replace);
    return this.http.post<ApiResponse<any>>(`${environment.apiUrl}/upload/${type}`, formData, { params });
  }

  getProgressUrl(uploadId: string, token: string): string {
    return `${environment.apiUrl}/upload/progress/${uploadId}?token=${token}`;
  }

  getHistory(page = 0, size = 20): Observable<ApiResponse<UploadLog[]>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ApiResponse<UploadLog[]>>(`${environment.apiUrl}/upload/history`, { params });
  }

  exportCsv(type: 'branch-sales' | 'employee-sales' | 'purchases' | 'mothan' | 'summary', from: string, to: string): void {
    this.downloadFile(`${environment.apiUrl}/export/${type}?from=${from}&to=${to}`);
  }

  importPgData(file: File): Observable<ApiResponse<any>> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<ApiResponse<any>>(`${environment.apiUrl}/admin/import-pg-data`, formData);
  }

  wipeAllData(): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${environment.apiUrl}/admin/wipe-data`, null);
  }

  exportNormalizedDb(): void {
    this.downloadFile(`${environment.apiUrl}/export/normalized-db`);
  }

  private downloadFile(url: string): void {
    this.http.get(url, { responseType: 'blob', observe: 'response' }).subscribe({
      next: res => {
        const blob = res.body!;
        const cd = res.headers.get('Content-Disposition') ?? '';
        const match = cd.match(/filename="?([^"]+)"?/);
        const filename = match ? match[1] : url.split('/').pop() ?? 'download';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      error: err => console.error('Download failed', err)
    });
  }
}
