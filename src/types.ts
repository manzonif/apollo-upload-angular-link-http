import {HttpHeaders} from '@angular/common/http';

export type HttpRequestOptions = {
  headers?: HttpHeaders;
  withCredentials?: boolean;
};

export type RequestOperation = {
  query?: string;
  variables?: Record<string, any>;
  operationName?: string;
  extensions?: Record<string, any>;
};


export type Request = {
  method: string;
  url: string;
  body: Body | Body[];
  options: HttpRequestOptions;
};
