import pyarrow.parquet as pq

table = pq.read_table('data_shms/events/earthquake_20260420_160446.parquet')
# Cetak langsung sebagai pyarrow table tanpa konversi ke pandas
print(table.to_pydict()) 
