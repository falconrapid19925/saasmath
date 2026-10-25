import { DatabaseSync } from 'node:sqlite';
/** Local SQLite adapter for the documented subset of D1; production receives Sites env.DB. */
export function localD1(filename) {
  const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  class Statement {
    constructor(sql,args=[]){this.sql=sql;this.args=args;}
    bind(...args){return new Statement(this.sql,args);}
    async first(column){const row=sqlite.prepare(this.sql).get(...this.args);return column?(row?.[column]??null):(row?{...row}:null);}
    async run(){const result=sqlite.prepare(this.sql).run(...this.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};}
    async all(){return {success:true,results:sqlite.prepare(this.sql).all(...this.args).map(r=>({...r})),meta:{changes:0}};}
  }
  return {prepare(sql){return new Statement(sql);},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(error){sqlite.exec('ROLLBACK');throw error;}},sqlite};
}
