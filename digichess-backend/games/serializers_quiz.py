from rest_framework import serializers


class DigiQuizJoinSerializer(serializers.Serializer):
    round_date = serializers.DateField(required=False)


class DigiQuizSubmitAnswerSerializer(serializers.Serializer):
    round_date = serializers.DateField(required=False)
    question_no = serializers.IntegerField(min_value=1, max_value=200)
    selected_index = serializers.IntegerField(min_value=0, max_value=12)


class DigiQuizPaginationSerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    page = serializers.IntegerField(required=False, min_value=1, default=1)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=200, default=50)
